from datetime import timedelta
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import serializers

from apps.academics.models import (
    GatePass,
    IoTKiosk,
    Schedule,
    SchoolProfile,
    Section,
    StaffProfile,
    Student,
    Subject,
    UserProfile,
)


# ==========================================
# AUTHENTICATION & HARDWARE SERIALIZERS
# ==========================================

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True)

class SchoolProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolProfile
        fields = [
            'id',
            'school_id',
            'school_name',
            'region',
            'division',
            'district',
            'principal_name',
            'principal_title',
            'left_logo',
            'right_logo',
            'latitude',
            'longitude',
            'geofence_radius_meters',
            'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']

class GateScanSerializer(serializers.Serializer):
    kiosk_code = serializers.CharField(required=True)
    secret_key = serializers.CharField(required=True)
    raw_identifier = serializers.CharField(required=True)
    scan_method = serializers.CharField(required=False, default='RFID')


class SingleScanItemSerializer(serializers.Serializer):
    qr_token = serializers.CharField(required=True)
    status = serializers.CharField(required=False, default='PRESENT')


class ClassroomBatchScanSerializer(serializers.Serializer):
    schedule_id = serializers.IntegerField(required=True)
    scans = SingleScanItemSerializer(many=True, required=True)


class TelemetryHeartbeatSerializer(serializers.Serializer):
    latitude = serializers.FloatField(required=True)
    longitude = serializers.FloatField(required=True)
    battery_level = serializers.IntegerField(required=False, default=100)
    is_inside_geofence = serializers.BooleanField(required=True)


# ==========================================
# FULL CRUD MODEL SERIALIZERS
# ==========================================

class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField(read_only=True)
    current_section = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Student
        fields = [
            'id', 'lrn', 'first_name', 'middle_name', 'last_name',
            'full_name', 'sex', 'birthdate', 'parent_contact',
            'rfid_uid', 'qr_token', 'is_active', 'current_section'
        ]
        extra_kwargs = {
            'birthdate': {'required': False, 'allow_null': True},
            'middle_name': {'required': False, 'allow_blank': True},
            'parent_contact': {'required': False, 'allow_blank': True},
            'rfid_uid': {'required': False, 'allow_blank': True, 'allow_null': True},
            'qr_token': {'required': False, 'allow_blank': True, 'allow_null': True},
        }

    def get_full_name(self, obj):
        return f"{obj.last_name}, {obj.first_name} {obj.middle_name or ''}".strip()

    def get_current_section(self, obj):
        enrollment = obj.enrollments.filter(academic_year__is_active=True).first()
        if enrollment and enrollment.section:
            grade = enrollment.section.grade_level.name if enrollment.section.grade_level else ""
            return f"{grade} - {enrollment.section.name}".strip(" - ")
        return "Unassigned"


class StaffProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = StaffProfile
        fields = [
            'id', 'employee_id', 'first_name', 'last_name', 'full_name',
            'position', 'department', 'contact_number', 'rfid_uid',
            'qr_token', 'is_active'
        ]
        extra_kwargs = {
            'contact_number': {'required': False, 'allow_blank': True},
            'rfid_uid': {'required': False, 'allow_blank': True, 'allow_null': True},
            'qr_token': {'required': False, 'allow_blank': True, 'allow_null': True},
        }

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip()


class IoTKioskSerializer(serializers.ModelSerializer):
    is_online = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = IoTKiosk
        fields = [
            'id', 'kiosk_code', 'terminal_name', 'secret_hash',
            'location', 'is_active', 'last_ping', 'is_online'
        ]
        extra_kwargs = {
            'secret_hash': {'write_only': True, 'required': False}
        }

    def get_is_online(self, obj):
        if not obj.last_ping:
            return False
        return (timezone.now() - obj.last_ping) < timedelta(minutes=5)


class GatePassSerializer(serializers.ModelSerializer):
    bearer_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = GatePass
        fields = [
            'id', 'staff', 'student', 'bearer_name', 'reason',
            'valid_from', 'valid_to', 'status'
        ]

    def get_bearer_name(self, obj):
        if obj.staff:
            return f"{obj.staff.first_name} {obj.staff.last_name}".strip()
        if obj.student:
            return f"{obj.student.first_name} {obj.student.last_name}".strip()
        return "Unassigned"


class SubjectSerializer(serializers.ModelSerializer):
    display_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Subject
        fields = ['id', 'code', 'title', 'tier', 'subject_type', 'units', 'display_title']

    def get_display_title(self, obj):
        return f"{obj.code} - {obj.title}"


class ScheduleSerializer(serializers.ModelSerializer):
    schedule_id = serializers.SerializerMethodField(read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)
    grade_level_name = serializers.CharField(source='section.grade_level.name', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    subject_title = serializers.CharField(source='subject.title', read_only=True)
    teacher_name = serializers.SerializerMethodField(read_only=True)
    time_slot = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Schedule
        fields = [
            'id', 'schedule_id', 'section', 'section_name', 'grade_level_name',
            'subject', 'subject_code', 'subject_title',
            'teacher', 'teacher_name', 'room_number',
            'start_time', 'end_time', 'time_slot'
        ]
        extra_kwargs = {
            'room_number': {'required': False, 'allow_blank': True},
            'teacher': {'required': False, 'allow_null': True},
        }

    def get_schedule_id(self, obj):
        return f"SCH-{obj.id:03d}"

    def get_teacher_name(self, obj):
        if obj.teacher:
            return f"{obj.teacher.first_name} {obj.teacher.last_name}".strip()
        return "Unassigned (TBA)"

    def get_time_slot(self, obj):
        if obj.start_time and obj.end_time:
            return f"{obj.start_time.strftime('%I:%M %p')} - {obj.end_time.strftime('%I:%M %p')}"
        return "TBD"


class UserManagementSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source='profile.role', default='STAFF')

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'is_active', 'role', 'password']
        extra_kwargs = {
            'password': {'write_only': True, 'required': False}
        }

    def create(self, validated_data):
        profile_data = validated_data.pop('profile', {})
        role = profile_data.get('role', 'STAFF')
        password = validated_data.pop('password', None)
        user = User.objects.create(**validated_data)
        if password:
            user.set_password(password)
            user.save()
        UserProfile.objects.update_or_create(user=user, defaults={'role': role})
        return user

    def update(self, instance, validated_data):
        profile_data = validated_data.pop('profile', {})
        role = profile_data.get('role', None)
        password = validated_data.pop('password', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)
        instance.save()

        if role:
            UserProfile.objects.update_or_create(user=instance, defaults={'role': role})
        return instance