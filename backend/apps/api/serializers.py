import base64
import uuid
from datetime import date, timedelta
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.utils import timezone
from rest_framework import serializers

from apps.academics.models import (
    AuditLog,
    Enrollment,
    GatePass,
    GradeLevel,
    IoTKiosk,
    Schedule,
    SchoolProfile,
    Section,
    StaffProfile,
    Student,
    Subject,
    UserProfile,
)


# ============================================================================
# SAFE IMAGE FIELD (BASE64 & MEDIA URL HANDLER)
# ============================================================================

class Base64ImageField(serializers.ImageField):
    """
    Accepts base64 image strings from frontend modals.
    If the frontend sends an existing file path or URL,
    it keeps the current image without failing validation.
    """
    def to_internal_value(self, data):
        if isinstance(data, str):
            if data.startswith('data:image'):
                try:
                    header, base64_str = data.split(';base64,')
                    ext = header.split('/')[-1]
                    if ext == 'jpeg':
                        ext = 'jpg'
                    file_name = f"{uuid.uuid4().hex[:10]}.{ext}"
                    data = ContentFile(base64.b64decode(base64_str), name=file_name)
                except Exception:
                    raise serializers.ValidationError("Invalid image format.")
            elif data.startswith('http') or data.startswith('/media') or '/' in data:
                return getattr(self.parent.instance, self.field_name, None)
            elif data.strip() == '':
                return None
        elif not data:
            return None
        return super().to_internal_value(data)


# ============================================================================
# AUTHENTICATION & HARDWARE SERIALIZERS
# ============================================================================

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True)


class SchoolProfileSerializer(serializers.ModelSerializer):
    school_seal_photo = serializers.CharField(
        source='school_logo',
        required=False,
        allow_null=True,
        allow_blank=True
    )

    class Meta:
        model = SchoolProfile
        fields = [
            'school_id',
            'school_name',
            'region',
            'division',
            'district',
            'address',
            'contact_number',
            'email',
            'principal_name',
            'principal_title',
            'kagawaran_logo',
            'deped_logo',
            'school_logo',
            'left_logo',
            'right_logo',
            'school_seal_photo',
            'latitude',
            'longitude',
            'geofence_radius_meters',
        ]


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
    is_mock_location = serializers.BooleanField(required=False, default=False)
    wifi_bssid = serializers.CharField(required=False, allow_blank=True, default='')
    client_device_id = serializers.CharField(required=False, allow_blank=True, default='')

# ============================================================================
# FULL CRUD MODEL SERIALIZERS
# ============================================================================

class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField(read_only=True)
    current_section = serializers.SerializerMethodField(read_only=True)
    photo_url = serializers.SerializerMethodField(read_only=True)
    photo = Base64ImageField(required=False, allow_null=True)
    sex = serializers.CharField(required=False)

    class Meta:
        model = Student
        fields = [
            'id',
            'lrn',
            'first_name',
            'middle_name',
            'last_name',
            'suffix',
            'full_name',
            'sex',
            'birthdate',
            'mother_tongue',
            'ethnic_group',
            'religion',
            'house_street_sitio',
            'barangay',
            'municipality_city',
            'province',
            'father_name',
            'mother_maiden_name',
            'guardian_name',
            'guardian_relationship',
            'parent_contact',
            'photo',
            'photo_thumbnail',
            'photo_url',
            'photo_updated_at',
            'rfid_uid',
            'qr_token',
            'is_active',
            'current_section',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'qr_token', 'created_at', 'updated_at']
        extra_kwargs = {
            'birthdate': {'required': False, 'allow_null': True},
            'middle_name': {'required': False, 'allow_blank': True},
            'suffix': {'required': False, 'allow_blank': True},
            'parent_contact': {'required': False, 'allow_blank': True},
            'rfid_uid': {'required': False, 'allow_blank': True, 'allow_null': True},
            'photo': {'required': False, 'allow_null': True},
        }

    def get_full_name(self, obj):
        parts = [obj.last_name, f"{obj.first_name}"]
        if obj.middle_name:
            parts.append(obj.middle_name)
        if obj.suffix:
            parts.append(obj.suffix)
        return f"{obj.last_name}, {' '.join(filter(None, [obj.first_name, obj.middle_name, obj.suffix]))}".strip()

    def get_current_section(self, obj):
        enrollment = obj.enrollments.filter(academic_year__is_active=True).first()
        if enrollment and enrollment.section:
            grade = enrollment.section.grade_level.name if enrollment.section.grade_level else ""
            return f"{grade} - {enrollment.section.name}".strip(" - ")
        return "Unassigned"

    def get_photo_url(self, obj):
        if obj.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.photo.url)
            return obj.photo.url
        return None

    def validate_sex(self, value):
        # Strictly accept only Male or Female
        if value in ['Male', 'M', 'm', 'male']:
            return 'Male'
        if value in ['Female', 'F', 'f', 'female']:
            return 'Female'
        raise serializers.ValidationError("Sex must be either Male or Female.")

    def validate_rfid_uid(self, value):
        if not value or str(value).strip() == '':
            return None
        clean_value = str(value).strip()
        instance = getattr(self, 'instance', None)
        qs = Student.objects.filter(rfid_uid=clean_value)
        if instance:
            qs = qs.exclude(id=instance.id)
        if qs.exists():
            raise serializers.ValidationError("This RFID card is already assigned to another student.")
        return clean_value

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # If the photo is the default avatar file that does not exist, return None
        if ret.get('photo') and 'default_avatar.png' in str(ret['photo']):
            ret['photo'] = None
        return ret

    def create(self, validated_data):
        if 'birthdate' not in validated_data or not validated_data['birthdate']:
            validated_data['birthdate'] = date(2010, 1, 1)

        if 'qr_token' not in validated_data or not validated_data['qr_token']:
            validated_data['qr_token'] = f"STU-{uuid.uuid4().hex}"

        return super().create(validated_data)

class StaffProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField(read_only=True)
    photo_url = serializers.SerializerMethodField(read_only=True)
    photo = Base64ImageField(required=False, allow_null=True)

    class Meta:
        model = StaffProfile
        fields = [
            'id',
            'employee_id',
            'first_name',
            'middle_name',
            'last_name',
            'suffix',
            'full_name',
            'position',
            'department',
            'contact_number',
            'email',
            'photo',
            'photo_url',
            'photo_updated_at',
            'rfid_uid',
            'qr_token',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'qr_token', 'created_at', 'updated_at']
        extra_kwargs = {
            'middle_name': {'required': False, 'allow_blank': True},
            'suffix': {'required': False, 'allow_blank': True},
            'contact_number': {'required': False, 'allow_blank': True},
            'email': {'required': False, 'allow_blank': True},
            'rfid_uid': {'required': False, 'allow_blank': True, 'allow_null': True},
            'photo': {'required': False, 'allow_null': True},
        }

    def get_full_name(self, obj):
        name_parts = [obj.first_name]
        if obj.middle_name:
            name_parts.append(obj.middle_name)
        name_parts.append(obj.last_name)
        if obj.suffix:
            name_parts.append(obj.suffix)
        return " ".join(filter(None, name_parts)).strip()

    def get_photo_url(self, obj):
        if obj.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.photo.url)
            return obj.photo.url
        return None

    def validate_rfid_uid(self, value):
        if not value or str(value).strip() == '':
            return None
        clean_value = str(value).strip()
        instance = getattr(self, 'instance', None)
        qs = StaffProfile.objects.filter(rfid_uid=clean_value)
        if instance:
            qs = qs.exclude(id=instance.id)
        if qs.exists():
            raise serializers.ValidationError("This RFID card is already assigned to another staff member.")
        return clean_value

    def create(self, validated_data):
        if 'qr_token' not in validated_data or not validated_data['qr_token']:
            validated_data['qr_token'] = f"STF-{uuid.uuid4().hex}"
        return super().create(validated_data)


class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField(read_only=True)
    student_lrn = serializers.CharField(source='student.lrn', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)
    academic_year_code = serializers.CharField(source='academic_year.code', read_only=True)

    class Meta:
        model = Enrollment
        fields = [
            'id',
            'student',
            'student_name',
            'student_lrn',
            'section',
            'section_name',
            'academic_year',
            'academic_year_code',
            'enrollment_date',
            'enrollment_type',
            'status',
            'status_date',
            'status_reason_code',
            'transferred_school',
            'is_cct_recipient',
            'cct_id_number',
            'disability_detail',
            'accelerated_detail',
            'remarks',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_student_name(self, obj):
        if obj.student:
            return f"{obj.student.last_name}, {obj.student.first_name}".strip()
        return "Unknown"


class IoTKioskSerializer(serializers.ModelSerializer):
    is_online = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = IoTKiosk
        fields = [
            'id',
            'kiosk_code',
            'terminal_name',
            'secret_hash',
            'location',
            'is_active',
            'last_ping',
            'is_online',
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
            'id',
            'pass_number',
            'staff',
            'student',
            'bearer_name',
            'pass_type',
            'reason',
            'valid_from',
            'valid_to',
            'status',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

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
        fields = [
            'id',
            'code',
            'title',
            'tier',
            'subject_type',
            'units',
            'display_title',
        ]

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
            'id',
            'schedule_id',
            'section',
            'section_name',
            'grade_level_name',
            'subject',
            'subject_code',
            'subject_title',
            'teacher',
            'teacher_name',
            'room_number',
            'start_time',
            'end_time',
            'time_slot',
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
    role = serializers.CharField(source='profile.role', default='TEACHER')

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'is_active',
            'role',
            'password',
        ]
        extra_kwargs = {
            'password': {'write_only': True, 'required': False}
        }

    def create(self, validated_data):
        profile_data = validated_data.pop('profile', {})
        role = profile_data.get('role', 'TEACHER')
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


class AuditLogSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'id',
            'table_name',
            'record_id',
            'action',
            'old_data',
            'new_data',
            'changed_fields',
            'performed_by',
            'performed_by_name',
            'client_ip',
            'user_agent',
            'created_at',
        ]
        read_only_fields = [
            'id',
            'table_name',
            'record_id',
            'action',
            'old_data',
            'new_data',
            'changed_fields',
            'performed_by',
            'performed_by_name',
            'client_ip',
            'user_agent',
            'created_at',
        ]

    def get_performed_by_name(self, obj):
        if obj.performed_by:
            return obj.performed_by.get_full_name() or obj.performed_by.username
        return "System / Device Kiosk"


class SF2StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField(read_only=True)
    date_enrolled = serializers.SerializerMethodField(read_only=True)
    date_dropped = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Student
        fields = ['id', 'lrn', 'full_name', 'sex', 'date_enrolled', 'date_dropped']

    def get_full_name(self, obj):
        return f"{obj.last_name}, {obj.first_name} {obj.middle_name or ''}".strip()

    def get_date_enrolled(self, obj):
        active_enr = obj.enrollments.filter(academic_year__is_active=True).first()
        return active_enr.enrollment_date if active_enr else None

    def get_date_dropped(self, obj):
        active_enr = obj.enrollments.filter(academic_year__is_active=True).first()
        return active_enr.status_date if (active_enr and active_enr.status == 'DROPPED') else None