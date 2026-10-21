from rest_framework import serializers
from django.utils import timezone
from apps.academics.models import IoTKiosk, GatePass, SmsOutbox

class IoTKioskSerializer(serializers.ModelSerializer):
    secret_hash = serializers.CharField(write_only=True, required=False, allow_blank=True)
    is_online = serializers.SerializerMethodField()

    class Meta:
        model = IoTKiosk
        fields = [
            'id', 'kiosk_code', 'terminal_name', 'location', 'secret_hash',
            'is_active', 'is_online', 'last_ping',
        ]

    def get_is_online(self, obj):
        if not obj.is_active or not obj.last_ping:
            return False
        return (timezone.now() - obj.last_ping).total_seconds() < 180


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
        return obj.faculty.full_name if obj.faculty else ""

    def get_student_name(self, obj):
        return obj.student.full_name if obj.student else ""


class SmsOutboxSerializer(serializers.ModelSerializer):
    class Meta:
        model = SmsOutbox
        fields = [
            'id', 'recipient_name', 'recipient_number', 'message_body',
            'trigger_event', 'category', 'priority', 'status',
            'error_message', 'retry_count', 'created_at', 'sent_at',
        ]


class GateScanSerializer(serializers.Serializer):
    raw_identifier = serializers.CharField(max_length=128)
    scan_method = serializers.ChoiceField(choices=['RFID', 'QR'], default='RFID', required=False)
    kiosk_code = serializers.CharField(max_length=64)
    secret_key = serializers.CharField(max_length=256)
    direction = serializers.ChoiceField(choices=['IN', 'OUT'], required=False, allow_null=True, allow_blank=True)
    enforce_student_only = serializers.BooleanField(default=False, required=False)


class SingleClassroomScanItemSerializer(serializers.Serializer):
    qr_token = serializers.CharField(max_length=128)
    status = serializers.ChoiceField(
        choices=['PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'CUTTING', 'UNVERIFIED'],
        default='PRESENT', required=False,
    )


class ClassroomBatchScanSerializer(serializers.Serializer):
    schedule_id = serializers.IntegerField()
    scans = SingleClassroomScanItemSerializer(many=True)


class TelemetryHeartbeatSerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90.0, max_value=90.0)
    longitude = serializers.FloatField(min_value=-180.0, max_value=180.0)
    battery_level = serializers.IntegerField(min_value=0, max_value=100, default=100, required=False)
    is_mock_location = serializers.BooleanField(default=False, required=False)
    client_device_id = serializers.CharField(max_length=128, required=False, allow_blank=True)
