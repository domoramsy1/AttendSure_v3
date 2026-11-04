"""
AttendSure V3 - Academic Structure Serializers
File: backend/apps/api/serializers/academics.py
"""

from rest_framework import serializers
from apps.academics.models import (
    Room,
    GradeLevel,
    AcademicYear,
    Subject,
    Section,
    Schedule,
    Enrollment,
)
from apps.common.utils import format_deduped_section_label


class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ['id', 'name', 'building', 'capacity', 'room_type', 'is_active']


class GradeLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradeLevel
        fields = ['id', 'code', 'name', 'stage', 'level_order']


class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicYear
        fields = ['id', 'code', 'start_date', 'first_friday_june', 'end_date', 'is_active']


class SubjectSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='title', required=False)

    class Meta:
        model = Subject
        fields = ['id', 'code', 'title', 'name', 'tier', 'subject_type', 'units']


class SectionSerializer(serializers.ModelSerializer):
    grade_level_name = serializers.CharField(source='grade_level.name', read_only=True)
    grade_level_code = serializers.CharField(source='grade_level.code', read_only=True)
    adviser_name = serializers.CharField(source='adviser.full_name', read_only=True)
    academic_year_code = serializers.CharField(source='academic_year.code', read_only=True)
    room_name = serializers.CharField(source='room.name', read_only=True)
    display_label = serializers.SerializerMethodField()

    grade_level_id = serializers.IntegerField(write_only=True, required=False)
    adviser_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    room_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Section
        fields = [
            'id', 'name', 'code', 'grade_level', 'grade_level_id', 'grade_level_name',
            'grade_level_code', 'academic_year', 'academic_year_code',
            'adviser', 'adviser_id', 'adviser_name',
            'room', 'room_id', 'room_name', 'room_number', 'capacity',
            'track_strand', 'display_label',
        ]
        extra_kwargs = {
            'academic_year': {'required': False, 'allow_null': True},
            'grade_level': {'required': False},
            'adviser': {'required': False, 'allow_null': True},
            'room': {'required': False, 'allow_null': True},
            'room_number': {'required': False, 'allow_blank': True},
            'capacity': {'required': False},
            'code': {'required': False, 'allow_blank': True},
        }

    def get_display_label(self, obj) -> str:
        grade = obj.grade_level.name if obj.grade_level else ''
        return format_deduped_section_label(grade, obj.name)

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


class ScheduleSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source='section.name', read_only=True)
    subject_title = serializers.CharField(source='subject.title', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    faculty_name = serializers.SerializerMethodField()
    days_of_week = serializers.SerializerMethodField()
    schedule_code = serializers.SerializerMethodField()

    class Meta:
        model = Schedule
        fields = [
            'id', 'schedule_code', 'section', 'section_id', 'section_name',
            'subject', 'subject_id', 'subject_title', 'subject_code',
            'faculty', 'faculty_id', 'faculty_name', 'room', 'room_number',
            'days_of_week', 'start_time', 'end_time',
        ]

    def get_schedule_code(self, obj) -> str:
        return obj.schedule_code or f"SCH-{obj.id:04d}"

    def get_faculty_name(self, obj) -> str:
        return obj.faculty.full_name if obj.faculty else "Unassigned"

    def get_days_of_week(self, obj) -> str:
        days_qs = obj.days.all().order_by('day_of_week')
        if not days_qs.exists():
            return obj.days_of_week or "MON-FRI"
        nums = [d.day_of_week for d in days_qs]
        if nums == [1, 2, 3, 4, 5]: return "MON-FRI"
        if nums == [1, 3, 5]: return "MWF"
        if nums == [2, 4]: return "TTH"
        if nums == [6]: return "SAT"
        labels = {1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT', 7: 'SUN'}
        return ",".join([labels.get(n, str(n)) for n in nums])


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

    def create(self, validated_data):
        if not validated_data.get('academic_year'):
            validated_data['academic_year'] = (
                AcademicYear.objects.filter(is_active=True).first()
                or AcademicYear.objects.first()
            )
        return super().create(validated_data)