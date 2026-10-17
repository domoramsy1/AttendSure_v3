"""
AttendSure - DRF Serializers & Data Validation Architecture
File: backend/apps/api/serializers.py
"""

import base64
import secrets
import uuid

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.db import connection
from django.utils import timezone
from rest_framework import serializers

from apps.academics.models import (
    AcademicYear,
    Enrollment,
    FacultyProfile,
    GatePass,
    GradeLevel,
    IoTKiosk,
    Schedule,
    ScheduleDay,
    SchoolProfile,
    Section,
    SmsOutbox,
    Student,
    Subject,
    UserProfile,
    USER_ROLE_CHOICES,
)

User = get_user_model()

# Cybersecurity: 5 MB upload limit to prevent Denial-of-Service (DoS) via memory exhaustion
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}


def ensure_user_profile_columns():
    """Database self-healing: ensures PostgreSQL user_profiles table has hybrid flags."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                ALTER TABLE user_profiles
                ADD COLUMN IF NOT EXISTS is_teaching BOOLEAN NOT NULL DEFAULT TRUE;
            """)
            cursor.execute("""
                ALTER TABLE user_profiles
                ADD COLUMN IF NOT EXISTS is_profile_completed BOOLEAN NOT NULL DEFAULT FALSE;
            """)
    except Exception:
        pass


# ============================================================================
# SHARED MEDIA & SECURE BASE64 IMAGE PARSER
# ============================================================================

def safe_photo_url(photo_field, request=None):
    """Safely converts an ImageField or relative URI into an absolute URL."""
    if not photo_field:
        return None
    try:
        if isinstance(photo_field, str):
            val = photo_field.strip()
            if not val or val.lower() in ('none', 'null', 'undefined'):
                return None
            if val.startswith(('http://', 'https://', 'data:image/')):
                return val
            if val.startswith('/media/') and request:
                return request.build_absolute_uri(val)
            return val

        if hasattr(photo_field, 'name') and photo_field.name:
            val_name = str(photo_field.name).strip()
            if val_name.startswith(('data:image/', 'http://', 'https://')):
                return val_name
            url = photo_field.url
            if request:
                return request.build_absolute_uri(url)
            return url
    except Exception:
        return None
    return None


class FlexibleImageField(serializers.Field):
    """
    Validates and converts incoming Base64 image payloads into Django ContentFiles.
    Enforces format whitelisting and strict file size checks.
    """

    def to_representation(self, value):
        request = self.context.get('request')
        return safe_photo_url(value, request)

    def to_internal_value(self, data):
        if data in (None, '', 'null'):
            return None

        if hasattr(data, 'read'):
            if data.size > MAX_IMAGE_SIZE_BYTES:
                raise serializers.ValidationError("Image file size exceeds the 5 MB limit.")
            return data

        if isinstance(data, str):
            clean = data.strip()
            if not clean or clean.lower() in ('none', 'null', 'undefined'):
                return None

            if clean.startswith('data:image') and ';base64,' in clean:
                try:
                    header, img_str = clean.split(';base64,', 1)
                    raw_ext = header.split('/')[-1].split(';')[0].lower()
                    ext = 'jpg' if raw_ext in ('jpeg', 'pjpeg') else raw_ext

                    if ext not in ALLOWED_IMAGE_EXTENSIONS:
                        raise serializers.ValidationError(
                            f"Unsupported image format (.{ext}). Allowed: PNG, JPG, WEBP."
                        )

                    decoded_data = base64.b64decode(img_str, validate=True)
                    if len(decoded_data) > MAX_IMAGE_SIZE_BYTES:
                        raise serializers.ValidationError("Decoded image exceeds the 5 MB limit.")

                    file_name = f"upload_{uuid.uuid4().hex[:12]}.{ext}"
                    return ContentFile(decoded_data, name=file_name)
                except serializers.ValidationError:
                    raise
                except Exception as exc:
                    raise serializers.ValidationError(f"Invalid Base64 image: {exc}")

            if clean.startswith(('http://', 'https://', '/media/')):
                raise serializers.SkipField()

        raise serializers.SkipField()


# ============================================================================
# 1. STUDENT SERIALIZER
# ============================================================================

class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    current_section = serializers.SerializerMethodField()
    section_id = serializers.SerializerMethodField()
    photo = FlexibleImageField(required=False, allow_null=True)
    photo_url = serializers.SerializerMethodField()

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
            'rfid_uid',
            'qr_token',
            'photo',
            'photo_url',
            'current_section',
            'section_id',
            'is_active',
        ]
        extra_kwargs = {
            'qr_token': {'required': False, 'allow_blank': True, 'allow_null': True},
            'rfid_uid': {'required': False, 'allow_blank': True, 'allow_null': True},
            'middle_name': {'required': False, 'allow_blank': True},
            'suffix': {'required': False, 'allow_blank': True},
            'parent_contact': {'required': False, 'allow_blank': True},
        }

    def validate_lrn(self, value):
        clean_lrn = value.strip()
        if not clean_lrn.isdigit():
            raise serializers.ValidationError("LRN must contain numbers only.")
        return clean_lrn

    def validate_rfid_uid(self, value):
        if not value or not str(value).strip():
            return None
        return str(value).strip().upper()

    def validate_parent_contact(self, value):
        if not value:
            return ""
        return value.strip().replace(" ", "").replace("-", "")

    def get_full_name(self, obj):
        if hasattr(obj, 'full_name') and isinstance(obj.full_name, str):
            return obj.full_name
        mid = f" {obj.middle_name}" if getattr(obj, 'middle_name', None) else ""
        suf = f" {obj.suffix}" if getattr(obj, 'suffix', None) else ""
        return f"{obj.last_name}, {obj.first_name}{mid}{suf}".strip(" ,")

    def get_current_section(self, obj):
        enrollment = (
            obj.enrollments.filter(academic_year__is_active=True)
            .select_related('section', 'section__grade_level')
            .first()
        )
        if not enrollment:
            enrollment = obj.enrollments.select_related('section', 'section__grade_level').first()

        if enrollment and enrollment.section:
            sec_name = (enrollment.section.name or "").strip()
            grade_name = (
                enrollment.section.grade_level.name
                if enrollment.section.grade_level
                else ""
            ).strip()
            if not grade_name:
                return sec_name
            if not sec_name or grade_name.lower().endswith(sec_name.lower()):
                return grade_name
            return f"{grade_name} - {sec_name}"
        return "Unassigned"

    def get_section_id(self, obj):
        enrollment = obj.enrollments.filter(academic_year__is_active=True).first()
        if not enrollment:
            enrollment = obj.enrollments.first()
        return enrollment.section_id if enrollment else None

    def get_photo_url(self, obj):
        request = self.context.get('request')
        return safe_photo_url(getattr(obj, 'photo', None), request)

    def create(self, validated_data):
        if not validated_data.get('qr_token'):
            validated_data['qr_token'] = secrets.token_urlsafe(32)

        student = super().create(validated_data)

        req_data = self.context.get('request').data if self.context.get('request') else {}
        sec_id = req_data.get('section_id') or req_data.get('section')
        if sec_id and str(sec_id).isdigit():
            section = Section.objects.filter(id=int(sec_id)).first()
            if section:
                ay = section.academic_year or AcademicYear.objects.filter(is_active=True).first()
                if ay:
                    Enrollment.objects.update_or_create(
                        student=student,
                        academic_year=ay,
                        defaults={'section': section, 'status': 'ENROLLED'},
                    )
        return student

    def update(self, instance, validated_data):
        student = super().update(instance, validated_data)
        req_data = self.context.get('request').data if self.context.get('request') else {}
        sec_id = req_data.get('section_id') or req_data.get('section')
        if sec_id and str(sec_id).isdigit():
            section = Section.objects.filter(id=int(sec_id)).first()
            if section:
                ay = section.academic_year or AcademicYear.objects.filter(is_active=True).first()
                if ay:
                    Enrollment.objects.update_or_create(
                        student=student,
                        academic_year=ay,
                        defaults={'section': section, 'status': 'ENROLLED'},
                    )
        return student


# ============================================================================
# 2. FACULTY PROFILE & DROPDOWN SERIALIZERS
# ============================================================================

class FacultyDropdownSerializer(serializers.ModelSerializer):
    """
    Cybersecurity Hardened: Lightweight serializer for scheduling dropdowns.
    Only exposes non-sensitive academic credentials. Never leaks RFID or device tokens.
    """
    full_name = serializers.CharField(read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = FacultyProfile
        fields = [
            'id',
            'employee_id',
            'first_name',
            'last_name',
            'suffix',
            'full_name',
            'department',
            'position',
            'can_teach',
            'is_active',
            'photo_url',
        ]

    def get_photo_url(self, obj):
        request = self.context.get('request')
        return safe_photo_url(getattr(obj, 'photo', None), request)


class FacultyProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    photo = FlexibleImageField(required=False, allow_null=True)
    photo_url = serializers.SerializerMethodField()

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
            'email',
            'contact_number',
            'position',
            'department',
            'can_teach',
            'is_active',
            'rfid_uid',
            'qr_token',
            'bound_device_id',
            'device_model',
            'device_bound_at',
            'photo',
            'photo_url',
        ]
        extra_kwargs = {
            'qr_token': {'required': False, 'allow_blank': True, 'allow_null': True},
            'rfid_uid': {'required': False, 'allow_blank': True, 'allow_null': True},
            'bound_device_id': {'required': False, 'allow_blank': True, 'allow_null': True},
            'middle_name': {'required': False, 'allow_blank': True},
            'suffix': {'required': False, 'allow_blank': True},
        }

    def validate_employee_id(self, value):
        return value.strip().upper()

    def validate_rfid_uid(self, value):
        if not value or not str(value).strip():
            return None
        return str(value).strip().upper()

    def validate_bound_device_id(self, value):
        if not value or not str(value).strip():
            return None
        return str(value).strip()

    def get_photo_url(self, obj):
        request = self.context.get('request')
        return safe_photo_url(getattr(obj, 'photo', None), request)

    def create(self, validated_data):
        if not validated_data.get('qr_token'):
            validated_data['qr_token'] = secrets.token_urlsafe(32)
        # Default can_teach to True on creation if not explicitly specified
        if 'can_teach' not in validated_data:
            validated_data['can_teach'] = True
        return super().create(validated_data)


# ============================================================================
# 3. SCHEDULE, SUBJECT, KIOSK & GATE PASS SERIALIZERS
# ============================================================================

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
            'id',
            'schedule_code',
            'section',
            'section_id',
            'section_name',
            'subject',
            'subject_id',
            'subject_title',
            'subject_code',
            'faculty',
            'faculty_id',
            'faculty_name',
            'room_number',
            'days_of_week',
            'start_time',
            'end_time',
        ]

    def get_schedule_code(self, obj):
        return f"SCH-{obj.id:04d}"

    def get_faculty_name(self, obj):
        if obj.faculty:
            return obj.faculty.full_name
        return "Unassigned"

    def get_days_of_week(self, obj):
        days_qs = obj.days.all().order_by('day_of_week')
        if not days_qs.exists():
            return "MON-FRI"
        nums = [d.day_of_week for d in days_qs]
        if nums == [1, 2, 3, 4, 5]:
            return "MON-FRI"
        if nums == [1, 3, 5]:
            return "MWF"
        if nums == [2, 4]:
            return "TTH"
        if nums == [6]:
            return "SAT"
        day_labels = {1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT', 7: 'SUN'}
        return ",".join([day_labels.get(n, str(n)) for n in nums])


class IoTKioskSerializer(serializers.ModelSerializer):
    secret_hash = serializers.CharField(write_only=True, required=False, allow_blank=True)
    is_online = serializers.SerializerMethodField()

    class Meta:
        model = IoTKiosk
        fields = [
            'id',
            'kiosk_code',
            'terminal_name',
            'location',
            'secret_hash',
            'is_active',
            'is_online',
            'last_ping',
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
            'id',
            'pass_number',
            'faculty',
            'faculty_name',
            'student',
            'student_name',
            'issued_by',
            'pass_type',
            'reason',
            'valid_from',
            'valid_to',
            'valid_until',
            'status',
        ]
        extra_kwargs = {
            'pass_number': {'required': False, 'allow_blank': True},
        }

    def get_faculty_name(self, obj):
        if obj.faculty:
            return obj.faculty.full_name
        return ""

    def get_student_name(self, obj):
        if obj.student:
            return obj.student.full_name
        return ""


class SmsOutboxSerializer(serializers.ModelSerializer):
    class Meta:
        model = SmsOutbox
        fields = [
            'id',
            'recipient_name',
            'recipient_number',
            'message_body',
            'trigger_event',
            'category',
            'priority',
            'status',
            'error_message',
            'retry_count',
            'created_at',
            'sent_at',
        ]
        extra_kwargs = {
            'recipient_name': {'required': False, 'allow_blank': True},
            'trigger_event': {'required': False, 'allow_blank': True},
            'category': {'required': False, 'allow_blank': True},
        }


# ============================================================================
# 4. SCHOOL PROFILE & USER MANAGEMENT SERIALIZERS
# ============================================================================

class SchoolProfileSerializer(serializers.ModelSerializer):
    left_logo = FlexibleImageField(required=False, allow_null=True)
    right_logo = FlexibleImageField(required=False, allow_null=True)
    school_logo = FlexibleImageField(required=False, allow_null=True)

    class Meta:
        model = SchoolProfile
        fields = '__all__'


class UserManagementSerializer(serializers.ModelSerializer):
    """
    Manages Accounts with Zero-Trust Role Boundaries.
    Automatically links and syncs FacultyProfile teaching clearances.
    """
    role = serializers.SerializerMethodField()
    current_role = serializers.SerializerMethodField()
    is_teaching = serializers.SerializerMethodField()
    can_teach = serializers.SerializerMethodField()
    is_profile_completed = serializers.SerializerMethodField()
    faculty_id = serializers.SerializerMethodField()
    photo = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'first_name',
            'last_name',
            'email',
            'role',
            'current_role',
            'is_teaching',
            'can_teach',
            'is_profile_completed',
            'faculty_id',
            'photo',
            'photo_url',
            'is_active',
            'is_staff',
            'is_superuser',
            'password',
        ]

    def _get_profile(self, obj):
        return getattr(obj, 'profile', None) or getattr(obj, 'userprofile', None)

    def get_role(self, obj):
        prof = self._get_profile(obj)
        if prof and getattr(prof, 'role', None):
            return str(prof.role).upper()
        if obj.is_superuser:
            return 'ADMIN'
        return 'FACULTY'

    def get_current_role(self, obj):
        role = self.get_role(obj)
        is_teach = self.get_is_teaching(obj)
        if role == 'ADMIN' and is_teach:
            return 'FACULTY_ADMIN'
        return role

    def get_is_teaching(self, obj):
        prof = self._get_profile(obj)
        if prof and hasattr(prof, 'is_teaching'):
            return bool(prof.is_teaching)
        return self.get_role(obj) == 'FACULTY'

    def get_can_teach(self, obj):
        prof = self._get_profile(obj)
        if prof and hasattr(prof, 'can_teach'):
            return bool(prof.can_teach)
        return self.get_is_teaching(obj)

    def get_is_profile_completed(self, obj):
        prof = self._get_profile(obj)
        if prof and hasattr(prof, 'is_profile_completed'):
            return bool(prof.is_profile_completed)
        return bool(obj.first_name and obj.last_name)

    def get_faculty_id(self, obj):
        prof = self._get_profile(obj)
        return getattr(prof, 'faculty_id', None) if prof else None

    def get_photo(self, obj):
        return self.get_photo_url(obj)

    def get_photo_url(self, obj):
        request = self.context.get('request')
        prof = self._get_profile(obj)
        if prof and getattr(prof, 'faculty', None) and prof.faculty.photo:
            return safe_photo_url(prof.faculty.photo, request)
        if prof and getattr(prof, 'avatar', None):
            return safe_photo_url(prof.avatar, request)
        return None

    def validate_password(self, value):
        if value:
            clean_pw = value.strip()
            if len(clean_pw) < 8:
                raise serializers.ValidationError("Password must be at least 8 characters long.")
            try:
                validate_password(clean_pw)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(list(exc.messages))
            return clean_pw
        return value

    def _parse_role_and_teaching(self, req_data, default_role='FACULTY', default_teaching=True):
        raw_role = str(req_data.get('role', default_role)).strip().upper()

        if raw_role in ('FACULTY_ADMIN', 'FACULTY/ADMIN', 'ADMIN_FACULTY'):
            final_role = 'ADMIN'
            is_teaching = True
        elif raw_role == 'ADMIN':
            final_role = 'ADMIN'
            is_teaching = bool(req_data.get('is_teaching', False))
        elif raw_role == 'GUARD':
            final_role = 'GUARD'
            is_teaching = False
        elif raw_role == 'FACULTY':
            final_role = 'FACULTY'
            is_teaching = True
        elif raw_role in ('PRINCIPAL', 'DEPT_HEAD'):
            final_role = raw_role
            is_teaching = bool(req_data.get('is_teaching', default_teaching))
        else:
            final_role = 'FACULTY'
            is_teaching = True

        return final_role, is_teaching

    def _default_position_for_role(self, final_role, is_teaching):
        if final_role == 'ADMIN' and is_teaching:
            return 'Faculty I / System Administrator'
        if final_role == 'ADMIN':
            return 'Administrative Officer II'
        if final_role == 'PRINCIPAL':
            return 'School Principal I'
        if final_role == 'DEPT_HEAD':
            return 'Head Faculty I'
        return 'Faculty I'

    def _sync_faculty_and_photo(self, user, prof, final_role, is_teaching, req_data):
        """
        Guarantees that newly created or updated accounts synchronize with FacultyProfile,
        enabling teaching clearances (can_teach=True) and active account states.
        """
        if final_role == 'GUARD' and not is_teaching:
            return

        emp_id = user.username.strip().upper()
        faculty = getattr(prof, 'faculty', None)

        if not faculty:
            faculty = FacultyProfile.objects.filter(employee_id__iexact=emp_id).first()

        default_pos = self._default_position_for_role(final_role, is_teaching)
        default_dept = (
            'Office of the Principal / Administration'
            if final_role in ('ADMIN', 'PRINCIPAL') and not is_teaching
            else 'Junior High School'
        )

        if not faculty:
            faculty = FacultyProfile.objects.create(
                employee_id=emp_id,
                first_name=user.first_name or user.username.capitalize(),
                last_name=user.last_name or 'Faculty',
                email=user.email or '',
                position=default_pos,
                department=default_dept,
                qr_token=secrets.token_urlsafe(32),
                can_teach=is_teaching,
                is_active=user.is_active,
            )
        else:
            if user.first_name:
                faculty.first_name = user.first_name
            if user.last_name:
                faculty.last_name = user.last_name
            if user.email:
                faculty.email = user.email
            faculty.is_active = user.is_active
            faculty.can_teach = is_teaching

        # Base64 photo processing
        raw_photo = req_data.get('photo')
        if raw_photo is not None:
            if raw_photo == '':
                faculty.photo = None
            elif isinstance(raw_photo, str) and raw_photo.startswith('data:image'):
                img_field = FlexibleImageField()
                content_file = img_field.to_internal_value(raw_photo)
                if content_file:
                    faculty.photo.save(content_file.name, content_file, save=False)

        faculty.save()
        prof.faculty = faculty

    def create(self, validated_data):
        ensure_user_profile_columns()
        req_data = self.context.get('request').data if self.context.get('request') else {}

        raw_password = validated_data.pop('password', None)
        password = raw_password if raw_password else secrets.token_urlsafe(12)

        final_role, is_teaching = self._parse_role_and_teaching(req_data)

        user = User(**validated_data)
        if final_role == 'ADMIN':
            user.is_staff = True
            user.is_superuser = True
        user.set_password(password)
        user.save()

        prof, _ = UserProfile.objects.get_or_create(user=user)
        prof.role = final_role
        prof.is_teaching = is_teaching
        prof.is_profile_completed = False

        self._sync_faculty_and_photo(user, prof, final_role, is_teaching, req_data)
        prof.save()
        return user

    def update(self, instance, validated_data):
        ensure_user_profile_columns()
        req_data = self.context.get('request').data if self.context.get('request') else {}

        password = validated_data.pop('password', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)

        prof, _ = UserProfile.objects.get_or_create(user=instance)

        if 'role' in req_data or 'is_teaching' in req_data:
            final_role, is_teaching = self._parse_role_and_teaching(
                req_data,
                default_role=prof.role or 'FACULTY',
                default_teaching=getattr(prof, 'is_teaching', True),
            )
            prof.role = final_role
            prof.is_teaching = is_teaching
            instance.is_staff = (final_role == 'ADMIN')
            instance.is_superuser = (final_role == 'ADMIN')
        else:
            final_role = prof.role or 'FACULTY'
            is_teaching = getattr(prof, 'is_teaching', True)

        if password:
            instance.set_password(password)
        instance.save()

        self._sync_faculty_and_photo(instance, prof, final_role, is_teaching, req_data)
        prof.save()
        return instance


# ============================================================================
# 5. HARDWARE GATE SCAN, BATCH SCAN & TELEMETRY INGESTION SERIALIZERS
# ============================================================================

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
        default='PRESENT',
        required=False,
    )


class ClassroomBatchScanSerializer(serializers.Serializer):
    schedule_id = serializers.IntegerField()
    scans = SingleClassroomScanItemSerializer(many=True)

    def validate_scans(self, value):
        if len(value) > 100:
            raise serializers.ValidationError("Batch size cannot exceed 100 students per submission.")
        return value


class TelemetryHeartbeatSerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90.0, max_value=90.0)
    longitude = serializers.FloatField(min_value=-180.0, max_value=180.0)
    battery_level = serializers.IntegerField(min_value=0, max_value=100, default=100, required=False)
    is_mock_location = serializers.BooleanField(default=False, required=False)
    client_device_id = serializers.CharField(max_length=128, required=False, allow_blank=True)