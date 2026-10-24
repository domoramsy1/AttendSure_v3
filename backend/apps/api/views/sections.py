"""
AttendSure - Section Management & Advisory Isolation
File: backend/apps/api/views/sections.py
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from apps.academics.models import Section, AcademicYear, GradeLevel, FacultyProfile
from .common import (
    IsAcademicManagerPermission,
    get_user_role,
    is_regular_teacher,
    resolve_faculty_for_user,
    format_deduped_section_label,
)


class SectionListAPIView(APIView):
    permission_classes = [IsAcademicManagerPermission]

    def get(self, request):
        user = request.user
        user_role = get_user_role(user)
        faculty = resolve_faculty_for_user(user)
        is_admin = user.is_superuser or user_role in ('ADMIN', 'PRINCIPAL')
        advisory_only = str(request.query_params.get('advisory_only', '')).lower() in ('true', '1')

        sections = (
            Section.objects.select_related('grade_level', 'academic_year', 'adviser')
            .filter(academic_year__is_active=True)
            .order_by('grade_level__level_order', 'name')
        )
        if not sections.exists():
            sections = (
                Section.objects.select_related('grade_level', 'academic_year', 'adviser')
                .all()
                .order_by('grade_level__level_order', 'name')
            )

        # Teachers only see their advisee sections.
        # Admins see all sections by default, but can filter to their own advisory if requested.
        if (not is_admin or advisory_only) and faculty:
            sections = sections.filter(adviser=faculty)

        data = [
            {
                'id': s.id,
                'name': s.name,
                'grade_level': s.grade_level.name if s.grade_level else '',
                'grade_level_id': s.grade_level_id,
                'academic_year': s.academic_year.code if s.academic_year else '',
                'adviser_name': s.adviser.full_name if s.adviser else '',
                'adviser_id': s.adviser_id,
                'is_my_advisory': bool(faculty and s.adviser_id == faculty.id),
                'room_number': s.room_number,
                'capacity': s.capacity,
                'display_label': format_deduped_section_label(
                    s.grade_level.name if s.grade_level else '', s.name
                ),
            }
            for s in sections
        ]
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request):
        data = request.data
        name = str(data.get('name', '')).strip()
        grade_id = data.get('grade_level_id') or data.get('grade_level')
        if not name or not grade_id:
            return Response({'error': 'Name and Grade Level required.'}, status=status.HTTP_400_BAD_REQUEST)

        ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
        gl = GradeLevel.objects.filter(id=grade_id).first()
        adv_id = data.get('adviser_id')
        adv = FacultyProfile.objects.filter(id=adv_id).first() if adv_id else None

        sec = Section.objects.create(
            name=name,
            grade_level=gl,
            academic_year=ay,
            adviser=adv,
            room_number=data.get('room_number', ''),
        )
        return Response({'id': sec.id, 'name': sec.name}, status=status.HTTP_201_CREATED)


class SectionDetailAPIView(APIView):
    permission_classes = [IsAcademicManagerPermission]

    def get(self, request, pk):
        sec = Section.objects.select_related('grade_level', 'academic_year', 'adviser').filter(pk=pk).first()
        if not sec:
            return Response({'error': 'Section not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            'id': sec.id,
            'name': sec.name,
            'grade_level': sec.grade_level.name if sec.grade_level else '',
            'adviser_name': sec.adviser.full_name if sec.adviser else '',
        }, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        Section.objects.filter(pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)