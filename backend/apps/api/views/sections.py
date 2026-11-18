"""
AttendSure - Section & Class List Views
File: backend/apps/api/views/sections.py
"""

from django.db.models import Count, Q
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import Enrollment, Schedule, Section
from .common import (
    format_deduped_section_label,
    format_full_student_name,
    get_faculty_section_ids,
    is_leadership_role,
    resolve_faculty_for_user,
    safe_photo_url,
)


class SectionListAPIView(APIView):
    """Returns active sections with enrolled student counts in a single batch query."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        qs = (
            Section.objects.filter(is_active=True)
            .select_related('grade_level', 'academic_year', 'adviser', 'room')
            .annotate(
                enrolled_count=Count(
                    'enrollments',
                    filter=Q(enrollments__status='ENROLLED', enrollments__student__is_active=True),
                    distinct=True,
                )
            )
            .order_by('grade_level__level_order', 'name')
        )

        if not (user.is_superuser or is_leadership_role(user)):
            faculty = resolve_faculty_for_user(user)
            if faculty:
                qs = qs.filter(id__in=get_faculty_section_ids(faculty))
            else:
                qs = qs.none()

        results = []
        for sec in qs:
            grade_name = sec.grade_level.name if sec.grade_level else ''
            results.append({
                'id': sec.id,
                'name': sec.name,
                'grade_level': grade_name,
                'grade_level_id': sec.grade_level_id,
                'academic_year': sec.academic_year.code if sec.academic_year else '',
                'adviser_id': sec.adviser_id,
                'adviser_name': sec.adviser.full_name if sec.adviser else 'Unassigned',
                'room_name': sec.room.name if sec.room else sec.room_number,
                'capacity': sec.capacity,
                'enrolled_count': sec.enrolled_count,
                'display_label': format_deduped_section_label(grade_name, sec.name),
            })

        return Response(results, status=status.HTTP_200_OK)


class SectionDetailAPIView(APIView):
    """Returns a section's details, uniform subject schedules, and enrolled class list."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk: int):
        user = request.user
        sec = (
            Section.objects.select_related('grade_level', 'academic_year', 'adviser', 'room')
            .filter(id=pk)
            .first()
        )
        if not sec:
            return Response({'error': 'Section not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not (user.is_superuser or is_leadership_role(user)):
            faculty = resolve_faculty_for_user(user)
            if not faculty or sec.id not in get_faculty_section_ids(faculty):
                return Response({'error': 'Access denied to this section.'}, status=status.HTTP_403_FORBIDDEN)

        enrollments = (
            Enrollment.objects.filter(section=sec, status='ENROLLED', student__is_active=True)
            .select_related('student')
            .order_by('student__last_name', 'student__first_name')
        )
        class_list = [
            {
                'id': enr.student.id,
                'lrn': enr.student.lrn,
                'full_name': format_full_student_name(enr.student),
                'sex': enr.student.sex,
                'parent_contact': enr.student.parent_contact,
                'qr_token': enr.student.qr_token,
                'photo_url': safe_photo_url(enr.student.photo, request),
            }
            for enr in enrollments if enr.student
        ]

        schedules = (
            Schedule.objects.filter(section=sec, is_active=True)
            .select_related('subject', 'faculty', 'room')
            .order_by('start_time')
        )
        schedule_items = [
            {
                'id': s.id,
                'subject_id': s.subject_id,
                'subject_code': s.subject.code if s.subject else '',
                'subject_title': s.subject.title if s.subject else '',
                'faculty_id': s.faculty_id,
                'faculty_name': s.faculty.full_name if s.faculty else 'Unassigned',
                'room_name': s.room.name if s.room else s.room_number,
                'start_time': str(s.start_time)[:5] if s.start_time else '',
                'end_time': str(s.end_time)[:5] if s.end_time else '',
            }
            for s in schedules
        ]

        grade_name = sec.grade_level.name if sec.grade_level else ''
        return Response({
            'id': sec.id,
            'name': sec.name,
            'grade_level': grade_name,
            'academic_year': sec.academic_year.code if sec.academic_year else '',
            'adviser_id': sec.adviser_id,
            'adviser_name': sec.adviser.full_name if sec.adviser else 'Unassigned',
            'room_name': sec.room.name if sec.room else sec.room_number,
            'capacity': sec.capacity,
            'display_label': format_deduped_section_label(grade_name, sec.name),
            'total_students': len(class_list),
            'class_list': class_list,
            'students': class_list,
            'schedules': schedule_items,
        }, status=status.HTTP_200_OK)