import base64
import os
import uuid
import re
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
    FacultyProfile,
    Student,
    Subject,
    UserProfile,
    SmsOutbox,
    USER_ROLE_CHOICES,
)

# ============================================================================
# SAFE IMAGE FIELD & STORAGE VALIDATION
# ============================================================================

def safe_photo_url(photo_field, request=None):
    """
    Returns an absolute URL only if the file actually exists on physical disk.
    Prevents parallel 404 image request storms and broken pipe errors.
    """
    if not photo_field:
        return None
    try:
        if hasattr(photo_field, 'path') and os.path.exists(photo_field.path):
            url = photo_field.url
            return request.build_absolute_uri(url) if request else url
        url_str = str(photo_field)
        if url_str.startswith('http') or url_str.startswith('data:image'):
            return url_str
    except Exception:
        pass
    return None



class SmsOutboxSerializer(serializers.ModelSerializer):
    """
    Serializes SmsOutbox records. Normalizes incoming field names
    and assigns sensible defaults for single/manual dispatches.
    """
    recipient_name = serializers.CharField(required=False, default='Authorized Contact', allow_blank=True)
    trigger_event = serializers.CharField(required=False, default='MANUAL', allow_blank=True)
    category = serializers.CharField(required=False, default='MANUAL', allow_blank=True)
    priority = serializers.CharField(required=False, default='HIGH', allow_blank=True)
    status = serializers.CharField(required=False, default='PENDING', allow_blank=True)

    class Meta:
        model = SmsOutbox
        fields = '__all__'

    def to_internal_value(self, data):
        normalized = {}
        for key, val in data.items():
            if val is not None:
                normalized[key] = val

        # 1. Normalize recipient phone number
        raw_phone = (
            normalized.get('recipient_number')
            or normalized.get('phone')
            or normalized.get('recipient')
            or normalized.get('number')
            or normalized.get('contact_number')
            or ''
        )
        if raw_phone:
            # Strip spaces, hyphens, and parenthesis
            clean_phone = re.sub(r'[\s\-\(\)]', '', str(raw_phone).strip())
            # Convert +639 to 09 format
            if clean_phone.startswith('+63'):
                clean_phone = '0' + clean_phone[3:]
            elif clean_phone.startswith('63') and len(clean_phone) == 12:
                clean_phone = '0' + clean_phone[2:]
            normalized['recipient_number'] = clean_phone

        # 2. Normalize message body
        msg_text = (
            normalized.get('message_body')
            or normalized.get('message')
            or normalized.get('text')
            or normalized.get('content')
            or normalized.get('body')
            or ''
        )
        if msg_text:
            normalized['message_body'] = str(msg_text).strip()

        # 3. Normalize recipient name
        name = (
            normalized.get('recipient_name')
            or normalized.get('name')
            or normalized.get('student_name')
            or 'Authorized Contact'
        )
        normalized['recipient_name'] = str(name).strip()

        # 4. Fill defaults for required system fields
        normalized.setdefault('trigger_event', 'MANUAL')
        normalized.setdefault('category', normalized['trigger_event'])
        normalized.setdefault('priority', 'HIGH')
        normalized.setdefault('status', 'PENDING')

        return super().to_internal_value(normalized)


class Base64ImageField(serializers.ImageField):
    """
    Accepts base64 image strings from frontend uploads.
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
    school_logo = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    left_logo = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    right_logo = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    principal_faculty_info = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SchoolProfile
        fields = [
            'id',
            'school_id',
            'school_name',
            'region',
            'division',
            'district',
            'address',
            'contact_number',
            'email',
            'principal_faculty',
            'principal_faculty_info',
            'principal_name',
            'principal_title',
            'school_logo',
            'left_logo',
            'right_logo',
            'latitude',
            'longitude',
            'geofence_radius_meters',
            'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']

    def get_principal_faculty_info(self, obj):
        if not obj.principal_faculty:
            return None
        f = obj.principal_faculty
        request = self.context.get('request')
        return {
            'id': f.id,
            'employee_id': f.employee_id,
            'full_name': f"{f.first_name} {f.last_name}".strip(),
            'position': f.position,
            'department': f.department,
            'photo_url': safe_photo_url(f.photo, request),
        }



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
        request = self.context.get('request')
        return safe_photo_url(obj.photo, request)

    def validate_sex(self, value):
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
        if ret.get('photo') and 'default_avatar.png' in str(ret['photo']):
            ret['photo'] = None
        return ret

    def create(self, validated_data):
        if 'birthdate' not in validated_data or not validated_data['birthdate']:
            validated_data['birthdate'] = date(2010, 1, 1)

        if 'qr_token' not in validated_data or not validated_data['qr_token']:
            validated_data['qr_token'] = f"STU-{uuid.uuid4().hex}"

        return super().create(validated_data)


class FacultyProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField(read_only=True)
    photo_url = serializers.SerializerMethodField(read_only=True)
    photo = Base64ImageField(required=False, allow_null=True)

    class Meta:
        model = FacultyProfile
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
        request = self.context.get('request')
        return safe_photo_url(obj.photo, request)

    def validate_rfid_uid(self, value):
        if not value or str(value).strip() == '':
            return None
        clean_value = str(value).strip()
        instance = getattr(self, 'instance', None)
        qs = FacultyProfile.objects.filter(rfid_uid=clean_value)
        if instance:
            qs = qs.exclude(id=instance.id)
        if qs.exists():
            raise serializers.ValidationError("This RFID card is already assigned to another faculty member.")
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
    secret_key = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = IoTKiosk
        fields = [
            'id',
            'kiosk_code',
            'terminal_name',
            'secret_key',
            'location',
            'is_active',
            'last_ping',
            'is_online',
        ]

    def get_is_online(self, obj):
        if not obj.last_ping:
            return False
        return (timezone.now() - obj.last_ping) < timedelta(minutes=5)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Expose stored hardware key to authenticated administrators
        ret['secret_key'] = getattr(instance, 'secret_hash', '') or ''
        return ret

    def create(self, validated_data):
        secret = validated_data.pop('secret_key', None)
        if secret and str(secret).strip():
            validated_data['secret_hash'] = str(secret).strip()
        elif 'secret_hash' not in validated_data:
            validated_data['secret_hash'] = f"SEC-{uuid.uuid4().hex[:12].upper()}"
        return super().create(validated_data)

    def update(self, instance, validated_data):
        secret = validated_data.pop('secret_key', None)
        if secret and str(secret).strip():
            instance.secret_hash = str(secret).strip()
        return super().update(instance, validated_data)

class GatePassSerializer(serializers.ModelSerializer):
    pass_number = serializers.CharField(required=False, allow_blank=True, default='')
    issued_by = serializers.PrimaryKeyRelatedField(
        queryset=FacultyProfile.objects.all(),
        required=False,
        allow_null=True,
        default=None
    )
    faculty = serializers.PrimaryKeyRelatedField(
        queryset=FacultyProfile.objects.all(),
        required=False,
        allow_null=True,
        default=None
    )
    student = serializers.PrimaryKeyRelatedField(
        queryset=Student.objects.all(),
        required=False,
        allow_null=True,
        default=None
    )
    valid_from = serializers.DateTimeField(required=False, allow_null=True, default=timezone.now)
    valid_to = serializers.DateTimeField(required=False, allow_null=True, default=None)

    issued_by_name = serializers.SerializerMethodField(read_only=True)
    student_name = serializers.SerializerMethodField(read_only=True)
    faculty_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = GatePass
        fields = [
            'id',
            'pass_number',
            'faculty',
            'faculty_name',
            'student',
            'student_name',
            'issued_by',
            'issued_by_name',
            'pass_type',
            'reason',
            'valid_from',
            'valid_to',
            'status',
            'created_at',
            'updated_at',
        ]

    def to_internal_value(self, data):
        cleaned = data.copy() if hasattr(data, 'copy') else dict(data)
        for key in ['faculty', 'student', 'issued_by', 'pass_number', 'valid_from', 'valid_to']:
            if cleaned.get(key) in ('', 'null', 'undefined', None):
                cleaned[key] = None
        return super().to_internal_value(cleaned)

    def create(self, validated_data):
        if not validated_data.get('pass_number'):
            today_str = timezone.now().strftime('%Y%m%d')
            unique_hex = uuid.uuid4().hex[:6].upper()
            validated_data['pass_number'] = f"GP-{today_str}-{unique_hex}"

        if not validated_data.get('issued_by'):
            request = self.context.get('request')
            if request and request.user.is_authenticated:
                user_prof = getattr(request.user, 'profile', None) or getattr(request.user, 'userprofile', None)
                staff = getattr(user_prof, 'faculty', None) if user_prof else None
                if not staff and request.user.email:
                    staff = FacultyProfile.objects.filter(email=request.user.email).first()
                if not staff:
                    staff = FacultyProfile.objects.filter(is_active=True).first()
                validated_data['issued_by'] = staff
            else:
                validated_data['issued_by'] = FacultyProfile.objects.filter(is_active=True).first()

        if not validated_data.get('valid_from'):
            validated_data['valid_from'] = timezone.now()
        if not validated_data.get('valid_to'):
            validated_data['valid_to'] = validated_data['valid_from'] + timedelta(hours=4)

        return super().create(validated_data)

    def get_issued_by_name(self, obj):
        if obj.issued_by:
            return f"{obj.issued_by.first_name} {obj.issued_by.last_name}".strip()
        return "System Admin"

    def get_student_name(self, obj):
        if obj.student:
            return f"{obj.student.first_name} {obj.student.last_name}".strip()
        return None

    def get_faculty_name(self, obj):
        if obj.faculty:
            return f"{obj.faculty.first_name} {obj.faculty.last_name}".strip()
        return None


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
    faculty_name = serializers.SerializerMethodField(read_only=True)
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
            'faculty',
            'faculty_name',
            'room_number',
            'start_time',
            'end_time',
            'time_slot',
        ]
        extra_kwargs = {
            'room_number': {'required': False, 'allow_blank': True},
            'faculty': {'required': False, 'allow_null': True},
        }

    def get_schedule_id(self, obj):
        return f"SCH-{obj.id:03d}"

    def get_faculty_name(self, obj):
        if obj.faculty:
            return f"{obj.faculty.first_name} {obj.faculty.last_name}".strip()
        return "Unassigned (TBA)"

    def get_time_slot(self, obj):
        if obj.start_time and obj.end_time:
            return f"{obj.start_time.strftime('%I:%M %p')} - {obj.end_time.strftime('%I:%M %p')}"
        return "TBD"


class UserManagementSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(choices=USER_ROLE_CHOICES, write_only=True)
    role_display = serializers.CharField(source='profile.get_role_display', read_only=True)
    current_role = serializers.CharField(source='profile.role', read_only=True)
    photo_url = serializers.SerializerMethodField(read_only=True)
    photo = Base64ImageField(required=False, allow_null=True, write_only=True)

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
            'role_display',
            'current_role',
            'photo',
            'photo_url',
        ]

    def _get_linked_faculty(self, obj):
        faculty = getattr(obj, 'facultyprofile', None)
        if not faculty:
            profile = getattr(obj, 'profile', None) or getattr(obj, 'userprofile', None)
            faculty = getattr(profile, 'faculty', None) if profile else None
        if not faculty and obj.email:
            faculty = FacultyProfile.objects.filter(email=obj.email).first()
        if not faculty and obj.first_name and obj.last_name:
            faculty = FacultyProfile.objects.filter(
                first_name__iexact=obj.first_name,
                last_name__iexact=obj.last_name
            ).first()
        return faculty

    def get_photo_url(self, obj):
        request = self.context.get('request')
        faculty = self._get_linked_faculty(obj)
        if faculty and faculty.photo:
            return safe_photo_url(faculty.photo, request)
        return None

    def update(self, instance, validated_data):
        new_role = validated_data.pop('role', None)
        uploaded_photo = validated_data.pop('photo', None)

        user = super().update(instance, validated_data)

        if new_role:
            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.role = new_role
            profile.save(update_fields=['role'])

        if uploaded_photo is not None:
            faculty = self._get_linked_faculty(user)
            if faculty:
                faculty.photo = uploaded_photo
                faculty.save(update_fields=['photo'])

        return user


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