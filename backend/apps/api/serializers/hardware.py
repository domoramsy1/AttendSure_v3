"""
AttendSure V3 - Classroom Scan, GPS Heartbeat, Exit Pass & Notification Serializers
File: backend/apps/api/serializers/hardware.py
"""

from rest_framework import serializers
from apps.academics.models import AppNotification, GatePass


class GatePassSerializer(serializers.ModelSerializer):
    faculty_name = serializers.SerializerMethodField()
    student_name = serializers.SerializerMethodField()
    valid_until = serializers.DateTimeField(source='valid_to', read_only=True)

    class Meta:
        model = GatePass
        fields = [
            'id', 'pass_number', 'faculty', 'faculty_name', 'student',
            'student_name', 'issued_by', 'pass_type', 'reason',
            'valid_from', 'valid_to', 'valid_until', 'status',
        ]
        extra_kwargs = {'pass_number': {'required': False, 'allow_blank': True}}

    def get_faculty_name(self, obj):
        return obj.faculty.full_name if obj.faculty else ''

    def get_student_name(self, obj):
        return obj.student.full_name if obj.student else ''


class AppNotificationSerializer(serializers.ModelSerializer):
    recipient_username = serializers.CharField(source='recipient.username', read_only=True)
    student_name = serializers.SerializerMethodField()

    class Meta:
        model = AppNotification
        fields = [
            'id', 'recipient', 'recipient_username', 'student', 'student_name',
            'title', 'message', 'category', 'is_read', 'is_pushed', 'created_at',
        ]
        read_only_fields = ['id', 'is_pushed', 'created_at']
        extra_kwargs = {
            'recipient': {'required': False, 'allow_null': True},
            'student': {'required': False, 'allow_null': True},
        }

    def get_student_name(self, obj):
        return obj.student.full_name if getattr(obj, 'student', None) else ''


class SingleClassroomScanItemSerializer(serializers.Serializer):
    qr_token = serializers.CharField(max_length=128)
    status = serializers.ChoiceField(
        choices=['PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'CUTTING', 'UNVERIFIED'],
        default='PRESENT',
        required=False,
    )


class ClassroomBatchScanSerializer(serializers.Serializer):
    schedule_id = serializers.IntegerField()
    scans = SingleClassroomScanItemSerializer(many=True)


class TelemetryHeartbeatSerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90.0, max_value=90.0)
    longitude = serializers.FloatField(min_value=-180.0, max_value=180.0)
    accuracy = serializers.FloatField(min_value=0.0, required=False, allow_null=True)
    battery_level = serializers.IntegerField(min_value=0, max_value=100, default=100, required=False)
    is_mock_location = serializers.BooleanField(default=False, required=False)
    client_device_id = serializers.CharField(max_length=128, required=False, allow_blank=True)