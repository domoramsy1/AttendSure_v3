from rest_framework import serializers
from apps.academics.models import Subject, Schedule

class SubjectSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='title', required=False)

    class Meta:
        model = Subject
        fields = ['id', 'code', 'title', 'name', 'units']


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
            'faculty', 'faculty_id', 'faculty_name', 'room_number',
            'days_of_week', 'start_time', 'end_time',
        ]

    def get_schedule_code(self, obj):
        return f"SCH-{obj.id:04d}"

    def get_faculty_name(self, obj):
        return obj.faculty.full_name if obj.faculty else "Unassigned"

    def get_days_of_week(self, obj):
        days_qs = obj.days.all().order_by('day_of_week')
        if not days_qs.exists():
            return "MON-FRI"
        nums = [d.day_of_week for d in days_qs]
        if nums == [1, 2, 3, 4, 5]: return "MON-FRI"
        if nums == [1, 3, 5]: return "MWF"
        if nums == [2, 4]: return "TTH"
        if nums == [6]: return "SAT"
        day_labels = {1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT', 7: 'SUN'}
        return ",".join([day_labels.get(n, str(n)) for n in nums])
