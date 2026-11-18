"""
AttendSure - Classroom Attendance & Enrollment Full CRUD Views
File: backend/apps/api/views/attendance_crud.py
"""

from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import (
    DailyAttendanceSummary,
    Enrollment,
    Schedule,
    Student,
    SubjectAttendanceLog,
)
from apps.api.serializers import EnrollmentSerializer
from .common import (
    IsAcademicManagerPermission,
    format_deduped_section_label,
    format_full_student_name,
    get_faculty_student_ids,
    get_student_active_section,
    is_leadership_role,
    resolve_faculty_for_user,
)


class EnrollmentViewSet(viewsets.ModelViewSet):
    """Full CRUD for student section enrollments."""
    queryset = Enrollment.objects.select_related(
        'student', 'section', 'section__grade_level', 'academic_year'
    ).order_by('-id')
    serializer_class = EnrollmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsAcademicManagerPermission]


class ClassroomAttendanceCRUDAPIView(APIView):
    """
    Full CRUD for Classroom Subject Attendance Records:
    - GET: List attendance records filtered by date, section_id, or schedule_id.
    - POST: Manually create or record an attendance entry for a student.
    - PUT / PATCH: Update an existing attendance status (PRESENT, LATE, EXCUSED, ABSENT, CUTTING).
    - DELETE: Delete an erroneous attendance log entry.
    """
    permission_classes = [permissions.IsAuthenticated]

    def _can_manage_student(self, user, student: Student) -> bool:
        if user.is_superuser or is_leadership_role(user):
            return True
        faculty = resolve_faculty_for_user(user)
        if not faculty:
            return False
        return student.id in get_faculty_student_ids(faculty)

    def get(self, request):
        user = request.user
        date_str = request.query_params.get('date')
        section_id = request.query_params.get('section_id')
        schedule_id = request.query_params.get('schedule_id')

        target_date = timezone.localdate()
        if date_str:
            try:
                target_date = timezone.datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                pass

        qs = SubjectAttendanceLog.objects.filter(attendance_date=target_date).select_related(
            'student', 'schedule', 'schedule__subject', 'schedule__section', 'schedule__section__grade_level'
        ).order_by('-scanned_at')

        if not (user.is_superuser or is_leadership_role(user)):
            faculty = resolve_faculty_for_user(user)
            if not faculty:
                return Response({'records': [], 'total': 0}, status=status.HTTP_200_OK)
            qs = qs.filter(student_id__in=get_faculty_student_ids(faculty))

        if section_id and str(section_id).isdigit():
            qs = qs.filter(schedule__section_id=int(section_id))
        if schedule_id and str(schedule_id).isdigit():
            qs = qs.filter(schedule_id=int(schedule_id))

        records = []
        for log in qs[:300]:
            sec = log.schedule.section if log.schedule else None
            grade_name = sec.grade_level.name if (sec and sec.grade_level) else ''
            records.append({
                'id': log.id,
                'student_id': log.student_id,
                'student_name': format_full_student_name(log.student),
                'lrn': log.student.lrn,
                'schedule_id': log.schedule_id,
                'subject_code': log.schedule.subject.code if (log.schedule and log.schedule.subject) else '',
                'subject_title': log.schedule.subject.title if (log.schedule and log.schedule.subject) else '',
                'section': format_deduped_section_label(grade_name, sec.name if sec else ''),
                'attendance_date': str(log.attendance_date),
                'status': log.status,
                'scan_method': log.scan_method,
                'scanned_at': timezone.localtime(log.scanned_at).strftime('%I:%M:%S %p') if log.scanned_at else '',
            })

        return Response({'records': records, 'total': len(records)}, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request):
        student_id = request.data.get('student_id')
        schedule_id = request.data.get('schedule_id')
        new_status = str(request.data.get('status', 'PRESENT')).upper().strip()
        date_str = request.data.get('attendance_date')

        if new_status not in {'PRESENT', 'LATE', 'CUTTING', 'ABSENT', 'EXCUSED'}:
            return Response({'error': 'Invalid attendance status.'}, status=status.HTTP_400_BAD_REQUEST)

        student = Student.objects.filter(id=student_id, is_active=True).first() if str(student_id).isdigit() else None
        if not student:
            return Response({'error': 'Valid student_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if not self._can_manage_student(request.user, student):
            return Response({'error': 'Access denied for this student.'}, status=status.HTTP_403_FORBIDDEN)

        section = get_student_active_section(student)
        schedule = Schedule.objects.filter(id=schedule_id).first() if str(schedule_id).isdigit() else None
        if not schedule and section:
            schedule = Schedule.objects.filter(section=section, is_active=True).order_by('start_time').first()
        if not schedule:
            return Response({'error': 'No active schedule found for this student.'}, status=status.HTTP_400_BAD_REQUEST)

        target_date = timezone.localdate()
        if date_str:
            try:
                target_date = timezone.datetime.strptime(str(date_str), '%Y-%m-%d').date()
            except ValueError:
                pass

        faculty = resolve_faculty_for_user(request.user) or schedule.faculty
        now_dt = timezone.now()

        log, _ = SubjectAttendanceLog.objects.update_or_create(
            student=student,
            schedule=schedule,
            attendance_date=target_date,
            defaults={
                'faculty': faculty,
                'status': new_status,
                'scan_method': 'MANUAL',
                'scanned_at': now_dt,
            },
        )

        if section:
            DailyAttendanceSummary.objects.update_or_create(
                student=student,
                attendance_date=target_date,
                defaults={
                    'section': section,
                    'status': new_status,
                    'remarks': 'Updated from class list.',
                },
            )

        return Response({
            'success': True,
            'id': log.id,
            'student_id': student.id,
            'student_name': format_full_student_name(student),
            'status': log.status,
            'attendance_date': str(log.attendance_date),
        }, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def put(self, request):
        record_id = request.data.get('id') or request.query_params.get('id')
        new_status = str(request.data.get('status', '')).upper().strip()

        if not record_id or not str(record_id).isdigit():
            return self.post(request)

        if new_status not in {'PRESENT', 'LATE', 'CUTTING', 'ABSENT', 'EXCUSED'}:
            return Response({'error': 'Valid status is required.'}, status=status.HTTP_400_BAD_REQUEST)

        log = SubjectAttendanceLog.objects.select_related('student', 'schedule__section').filter(id=int(record_id)).first()
        if not log:
            return Response({'error': 'Attendance record not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not self._can_manage_student(request.user, log.student):
            return Response({'error': 'Access denied for this record.'}, status=status.HTTP_403_FORBIDDEN)

        log.status = new_status
        log.save(update_fields=['status'])

        if log.schedule and log.schedule.section:
            DailyAttendanceSummary.objects.update_or_create(
                student=log.student,
                attendance_date=log.attendance_date,
                defaults={
                    'section': log.schedule.section,
                    'status': new_status,
                    'remarks': 'Status updated by faculty.',
                },
            )

        return Response({
            'success': True,
            'id': log.id,
            'status': log.status,
            'message': 'Attendance record updated.',
        }, status=status.HTTP_200_OK)

    def patch(self, request):
        return self.put(request)

    @transaction.atomic
    def delete(self, request):
        record_id = request.data.get('id') or request.query_params.get('id')
        if not record_id or not str(record_id).isdigit():
            return Response({'error': 'Valid attendance record id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        log = SubjectAttendanceLog.objects.select_related('student').filter(id=int(record_id)).first()
        if not log:
            return Response({'error': 'Attendance record not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not self._can_manage_student(request.user, log.student):
            return Response({'error': 'Access denied for this record.'}, status=status.HTTP_403_FORBIDDEN)

        student = log.student
        att_date = log.attendance_date
        log.delete()

        remaining = SubjectAttendanceLog.objects.filter(student=student, attendance_date=att_date).order_by('-scanned_at').first()
        if remaining and remaining.schedule and remaining.schedule.section:
            DailyAttendanceSummary.objects.update_or_create(
                student=student,
                attendance_date=att_date,
                defaults={'section': remaining.schedule.section, 'status': remaining.status},
            )
        else:
            DailyAttendanceSummary.objects.filter(student=student, attendance_date=att_date).delete()

        return Response({'success': True, 'message': 'Attendance record removed.'}, status=status.HTTP_200_OK)