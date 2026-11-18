"""
AttendSure - Academic Structure Serializers (Zero N+1 Queries)
File: backend/apps/api/serializers/academics.py
"""

from rest_framework import serializers
from apps.academics.models import (
    AcademicYear,
    Enrollment,
    GradeLevel,
    Room,
    Schedule,
    ScheduleDay,
    Section,
    Subject,
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
        fields = ['id', 'code', 'title', 'name', 'grade_level', 'tier', 'subject_type', 'units']


class SectionSerializer(serializers.ModelSerializer):
    grade_level_name = serializers.CharField(source='grade_level.name', read_only=True)
    grade_level_code = serializers.CharField(source='grade_level.code', read_only=True)
    adviser_name = serializers.CharField(source='adviser.full_name', read_only=True)
    academic_year_code = serializers.CharField(source='academic_year.code', read_only=True)
    room_name = serializers.CharField(source='room.name', read_only=True)
    display_label = serializers.SerializerMethodField()
    student_count = serializers.SerializerMethodField()

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
            'track_strand', 'display_label', 'student_count', 'is_active',
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

    def get_student_count(self, obj) -> int:
        return sum(1 for e in obj.enrollments.all() if e.status == 'ENROLLED')

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
    grade_level_name = serializers.CharField(source='section.grade_level.name', read_only=True)
    subject_title = serializers.CharField(source='subject.title', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    faculty_name = serializers.SerializerMethodField()
    days_of_week = serializers.CharField(required=False, default='MON-FRI')
    schedule_code = serializers.SerializerMethodField()

    section_id = serializers.IntegerField(write_only=True, required=False)
    subject_id = serializers.IntegerField(write_only=True, required=False)
    faculty_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    room_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Schedule
        fields = [
            'id', 'schedule_code', 'section', 'section_id', 'section_name', 'grade_level_name',
            'subject', 'subject_id', 'subject_title', 'subject_code',
            'faculty', 'faculty_id', 'faculty_name', 'room', 'room_id', 'room_number',
            'days_of_week', 'start_time', 'end_time', 'is_active',
        ]
        extra_kwargs = {
            'section': {'required': False},
            'subject': {'required': False},
            'faculty': {'required': False, 'allow_null': True},
            'room': {'required': False, 'allow_null': True},
        }

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'section_id' in data and 'section' not in data:
            data['section'] = data['section_id']
        if 'subject_id' in data and 'subject' not in data:
            data['subject'] = data['subject_id']
        if 'faculty_id' in data and 'faculty' not in data:
            data['faculty'] = data['faculty_id']
        if 'room_id' in data and 'room' not in data:
            data['room'] = data['room_id']
        return super().to_internal_value(data)

    def get_schedule_code(self, obj) -> str:
        return obj.schedule_code or f"SCH-{obj.id:04d}"

    def get_faculty_name(self, obj) -> str:
        return obj.faculty.full_name if obj.faculty else "Unassigned"

    def _sync_schedule_days(self, schedule: Schedule, days_text: str):
        mapping = {
            'MON-FRI': [1, 2, 3, 4, 5],
            'MWF': [1, 3, 5],
            'TTH': [2, 4],
            'SAT': [6],
        }
        day_lookup = {'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5, 'SAT': 6, 'SUN': 7}
        clean = str(days_text or 'MON-FRI').upper().strip()
        if clean in mapping:
            day_nums = mapping[clean]
        else:
            day_nums = [day_lookup[p.strip()] for p in clean.split(',') if p.strip() in day_lookup] or [1, 2, 3, 4, 5]

        ScheduleDay.objects.filter(schedule=schedule).exclude(day_of_week__in=day_nums).delete()
        existing = set(ScheduleDay.objects.filter(schedule=schedule).values_list('day_of_week', flat=True))
        ScheduleDay.objects.bulk_create([
            ScheduleDay(schedule=schedule, day_of_week=d) for d in day_nums if d not in existing
        ])

    def create(self, validated_data):
        days_text = validated_data.get('days_of_week', 'MON-FRI')
        schedule = super().create(validated_data)
        self._sync_schedule_days(schedule, days_text)
        return schedule

    def update(self, instance, validated_data):
        days_text = validated_data.get('days_of_week')
        schedule = super().update(instance, validated_data)
        if days_text is not None:
            self._sync_schedule_days(schedule, days_text)
        return schedule


class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    lrn = serializers.CharField(source='student.lrn', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)
    grade_level = serializers.CharField(source='section.grade_level.name', read_only=True)

    student_id = serializers.IntegerField(write_only=True, required=False)
    section_id = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = Enrollment
        fields = [
            'id', 'student', 'student_id', 'student_name', 'lrn',
            'section', 'section_id', 'section_name',
            'grade_level', 'academic_year', 'enrollment_date', 'status', 'remarks',
        ]
        extra_kwargs = {
            'student': {'required': False},
            'section': {'required': False},
            'academic_year': {'required': False, 'allow_null': True},
            'status': {'required': False},
        }

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'student_id' in data and 'student' not in data:
            data['student'] = data['student_id']
        if 'section_id' in data and 'section' not in data:
            data['section'] = data['section_id']
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