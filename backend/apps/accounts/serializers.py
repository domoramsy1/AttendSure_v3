import re
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from common.media import FlexibleImageField, build_media_url
from common.phone import normalize_ph_phone
from common.validators import (
    clean_text,
    validate_staff_role,
    validate_unique_employee_id,
    validate_unique_teacher_phone,
    validate_unique_user_email,
    validate_unique_username,
)
from .models import AuditLog, Department, PositionTitle, TeacherProfile, UserProfile
from .services import get_or_create_department, get_or_create_position

User = get_user_model()


class StaffAccountValidationMixin:
    """Shared role, email, employee ID, and phone uniqueness checks for staff serializers."""

    employee_id_required = False

    def _get_exclude_user_id(self) -> int | None:
        return None

    def _get_exclude_teacher_id(self) -> int | None:
        return None

    def validate_role(self, value: str) -> str:
        return validate_staff_role(value)

    def validate_email(self, value: str) -> str:
        return validate_unique_user_email(value, exclude_user_id=self._get_exclude_user_id())

    def validate_employee_id(self, value: str) -> str:
        return validate_unique_employee_id(
            value,
            exclude_teacher_id=self._get_exclude_teacher_id(),
            required=self.employee_id_required,
        )

    def validate_contact_number(self, value: str) -> str:
        return validate_unique_teacher_phone(
            value, exclude_teacher_id=self._get_exclude_teacher_id()
        )


def _generate_unique_username(base: str) -> str:
    slug = re.sub(r"[^a-z0-9._-]+", ".", base.lower()).strip(".")[:40] or "teacher"
    candidate = slug
    idx = 1
    while User.objects.filter(username__iexact=candidate).exists():
        candidate = f"{slug[:32]}_{idx}"
        idx += 1
    return candidate


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ["id", "code", "name"]


class PositionTitleSerializer(serializers.ModelSerializer):
    class Meta:
        model = PositionTitle
        fields = ["id", "title"]


class TeacherDropdownSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    department = serializers.CharField(source="department_name", read_only=True)
    department_name = serializers.CharField(read_only=True)
    position = serializers.CharField(source="position_title", read_only=True)
    position_title = serializers.CharField(read_only=True)
    can_teach = serializers.BooleanField(source="can_handle_classes", read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    photo_url = serializers.SerializerMethodField()
    advised_sections = serializers.SerializerMethodField()

    class Meta:
        model = TeacherProfile
        fields = [
            "id",
            "employee_id",
            "full_name",
            "first_name",
            "last_name",
            "department",
            "department_name",
            "position",
            "position_title",
            "contact_number",
            "email",
            "photo_url",
            "can_handle_classes",
            "can_teach",
            "advised_sections",
            "is_active",
        ]

    def get_photo_url(self, obj: TeacherProfile) -> str | None:
        return build_media_url(obj.photo, self.context.get("request"))

    def get_advised_sections(self, obj: TeacherProfile) -> list[str]:
        advised_map = self.context.get("advised_map")
        if advised_map is not None:
            return list(advised_map.get(obj.id, []))
        from apps.school.models import SchoolYear, Section
        from apps.school.selectors import format_section_label

        active_sy = SchoolYear.objects.filter(is_active=True).first()
        qs = Section.objects.filter(adviser=obj, is_active=True).select_related("grade_level")
        if active_sy:
            qs = qs.filter(school_year=active_sy)
        return [
            format_section_label(sec.grade_level.name if sec.grade_level else "", sec.name)
            for sec in qs.order_by("grade_level__level_number", "name")
        ]


class TeacherProfileSerializer(StaffAccountValidationMixin, serializers.ModelSerializer):
    """
    Flattens 3NF User + Department + PositionTitle attributes into clean JSON while writing
    back to the strictly normalized auth.User, Department, PositionTitle, and TeacherProfile tables.
    """

    employee_id_required = True

    first_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    email = serializers.EmailField(max_length=150, required=False, allow_blank=True, default="")
    username = serializers.CharField(max_length=150, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False, default=True)
    role = serializers.CharField(required=False, default="TEACHER")
    department = serializers.CharField(required=False, allow_blank=True, default="")
    position = serializers.CharField(required=False, allow_blank=True, default="")
    photo = FlexibleImageField(required=False, allow_null=True)
    photo_url = serializers.SerializerMethodField()
    remove_photo = serializers.BooleanField(required=False, write_only=True, default=False)
    full_name = serializers.CharField(read_only=True)
    department_name = serializers.CharField(read_only=True)
    position_title = serializers.CharField(read_only=True)
    has_bound_device = serializers.SerializerMethodField()
    has_biometric_enrolled = serializers.SerializerMethodField()
    can_teach = serializers.BooleanField(source="can_handle_classes", required=False)

    class Meta:
        model = TeacherProfile
        fields = [
            "id",
            "user",
            "username",
            "employee_id",
            "first_name",
            "middle_name",
            "last_name",
            "suffix",
            "full_name",
            "department",
            "department_name",
            "position",
            "position_title",
            "contact_number",
            "email",
            "role",
            "photo",
            "photo_url",
            "remove_photo",
            "can_handle_classes",
            "can_teach",
            "qr_token",
            "is_active",
            "bound_device_id",
            "device_model",
            "device_bound_at",
            "has_bound_device",
            "has_biometric_enrolled",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "qr_token", "device_bound_at", "created_at", "updated_at"]

    def get_photo_url(self, obj: TeacherProfile) -> str | None:
        return build_media_url(obj.photo, self.context.get("request"))

    def get_has_bound_device(self, obj: TeacherProfile) -> bool:
        return bool(obj.bound_device_id)

    def get_has_biometric_enrolled(self, obj: TeacherProfile) -> bool:
        return bool(obj.biometric_key_id)

    def to_representation(self, instance: TeacherProfile) -> dict:
        user = instance.user
        profile = getattr(user, "profile", None)
        return {
            "id": instance.id,
            "user": instance.user_id,
            "username": user.username if user else "",
            "employee_id": instance.employee_id,
            "first_name": user.first_name if user else "",
            "middle_name": instance.middle_name,
            "last_name": user.last_name if user else "",
            "suffix": instance.suffix,
            "full_name": instance.full_name,
            "department": instance.department_name,
            "department_name": instance.department_name,
            "position": instance.position_title,
            "position_title": instance.position_title,
            "contact_number": instance.contact_number,
            "email": user.email if user else "",
            "role": profile.role if profile else "TEACHER",
            "photo": build_media_url(instance.photo, self.context.get("request")),
            "photo_url": build_media_url(instance.photo, self.context.get("request")),
            "can_handle_classes": instance.can_handle_classes,
            "can_teach": instance.can_handle_classes,
            "qr_token": instance.qr_token,
            "is_active": bool(user.is_active) if user else False,
            "bound_device_id": instance.bound_device_id,
            "device_model": instance.device_model,
            "device_bound_at": instance.device_bound_at,
            "has_bound_device": bool(instance.bound_device_id),
            "has_biometric_enrolled": bool(instance.biometric_key_id),
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
        }

    def _get_exclude_user_id(self) -> int | None:
        return self.instance.user_id if (self.instance and self.instance.user_id) else None

    def _get_exclude_teacher_id(self) -> int | None:
        return self.instance.pk if self.instance else None

    def validate_username(self, value: str) -> str:
        if self.instance:
            return clean_text(value, 150)
        return validate_unique_username(value, required=False)

    def validate(self, attrs: dict) -> dict:
        if not self.instance:
            first = clean_text(attrs.get("first_name", ""), 100)
            last = clean_text(attrs.get("last_name", ""), 100)
            if not first or not last:
                raise serializers.ValidationError(
                    {"first_name": "First name and last name are required."}
                )
        return attrs

    @transaction.atomic
    def create(self, validated_data: dict) -> TeacherProfile:
        first_name = clean_text(validated_data.pop("first_name", ""), 100)
        last_name = clean_text(validated_data.pop("last_name", ""), 100)
        email = clean_text(validated_data.pop("email", ""), 150)
        raw_username = clean_text(validated_data.pop("username", ""), 150)
        is_active = bool(validated_data.pop("is_active", True))
        role = validated_data.pop("role", "TEACHER")
        dept_name = clean_text(validated_data.pop("department", ""), 100)
        pos_title = clean_text(validated_data.pop("position", ""), 100)
        validated_data.pop("remove_photo", None)

        username = raw_username or _generate_unique_username(
            f"{first_name}.{last_name}" if (first_name and last_name) else validated_data["employee_id"]
        )
        if User.objects.filter(username__iexact=username).exists():
            username = _generate_unique_username(username)

        user = User(
            username=username,
            first_name=first_name,
            last_name=last_name,
            email=email,
            is_active=is_active,
            is_staff=role == "ADMIN",
            is_superuser=role == "ADMIN",
        )
        user.set_unusable_password()
        user.save()

        UserProfile.objects.update_or_create(user=user, defaults={"role": role})

        validated_data["middle_name"] = clean_text(validated_data.get("middle_name", ""), 100)
        validated_data["suffix"] = clean_text(validated_data.get("suffix", ""), 20)
        teacher = TeacherProfile(
            user=user,
            department=get_or_create_department(dept_name),
            position=get_or_create_position(pos_title),
            **validated_data,
        )
        teacher.save()
        return teacher

    @transaction.atomic
    def update(self, instance: TeacherProfile, validated_data: dict) -> TeacherProfile:
        user = instance.user
        user_fields = []
        if "first_name" in validated_data:
            user.first_name = clean_text(validated_data.pop("first_name"), 100)
            user_fields.append("first_name")
        if "last_name" in validated_data:
            user.last_name = clean_text(validated_data.pop("last_name"), 100)
            user_fields.append("last_name")
        if "email" in validated_data:
            user.email = clean_text(validated_data.pop("email"), 150)
            user_fields.append("email")
        if "is_active" in validated_data:
            user.is_active = bool(validated_data.pop("is_active"))
            user_fields.append("is_active")
        validated_data.pop("username", None)

        if "role" in validated_data:
            role = validated_data.pop("role")
            UserProfile.objects.update_or_create(user=user, defaults={"role": role})
            user.is_staff = role == "ADMIN"
            user.is_superuser = role == "ADMIN"
            user_fields.extend(["is_staff", "is_superuser"])

        if user_fields:
            user.save(update_fields=list(dict.fromkeys(user_fields)))

        if "department" in validated_data:
            instance.department = get_or_create_department(str(validated_data.pop("department") or ""))
        if "position" in validated_data:
            instance.position = get_or_create_position(str(validated_data.pop("position") or ""))
        if "middle_name" in validated_data:
            validated_data["middle_name"] = clean_text(validated_data["middle_name"], 100)
        if "suffix" in validated_data:
            validated_data["suffix"] = clean_text(validated_data["suffix"], 20)
        if bool(validated_data.pop("remove_photo", False)):
            validated_data["photo"] = None

        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        return instance


_UNSET = object()


class UserAccountSerializer(StaffAccountValidationMixin, serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)
    role = serializers.CharField(required=False, default="TEACHER")
    middle_name = serializers.CharField(required=False, allow_blank=True, default="")
    suffix = serializers.CharField(required=False, allow_blank=True, default="")
    contact_number = serializers.CharField(required=False, allow_blank=True, default="")
    employee_id = serializers.CharField(required=False, allow_blank=True, default="")
    department = serializers.CharField(required=False, allow_blank=True, default="")
    position = serializers.CharField(required=False, allow_blank=True, default="")
    can_handle_classes = serializers.BooleanField(required=False, default=True)
    photo = FlexibleImageField(required=False, allow_null=True)
    remove_photo = serializers.BooleanField(required=False, write_only=True, default=False)
    teacher_id = serializers.IntegerField(source="teacher_profile.id", read_only=True, allow_null=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "password",
            "first_name",
            "middle_name",
            "last_name",
            "suffix",
            "email",
            "is_active",
            "role",
            "contact_number",
            "employee_id",
            "department",
            "position",
            "can_handle_classes",
            "photo",
            "remove_photo",
            "teacher_id",
        ]

    def _get_exclude_user_id(self) -> int | None:
        return self.instance.pk if self.instance else None

    def _get_exclude_teacher_id(self) -> int | None:
        teacher = getattr(self.instance, "teacher_profile", None) if self.instance else None
        return teacher.pk if teacher else None

    def validate_username(self, value: str) -> str:
        return validate_unique_username(
            value, exclude_user_id=self._get_exclude_user_id(), required=True
        )

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        if "contact_number" not in mutable and "phone_number" in mutable:
            mutable["contact_number"] = mutable["phone_number"]
        if "can_handle_classes" not in mutable:
            if "can_teach" in mutable:
                mutable["can_handle_classes"] = mutable["can_teach"]
            elif "is_teaching" in mutable:
                mutable["can_handle_classes"] = mutable["is_teaching"]
        return super().to_internal_value(mutable)

    def to_representation(self, instance) -> dict:
        prof = getattr(instance, "profile", None)
        teacher = getattr(instance, "teacher_profile", None)
        photo_url = build_media_url(teacher.photo, self.context.get("request")) if (teacher and teacher.photo) else None
        contact = teacher.contact_number if teacher else ""
        can_handle = bool(teacher.can_handle_classes) if teacher else True
        return {
            "id": instance.id,
            "username": instance.username,
            "first_name": instance.first_name,
            "middle_name": teacher.middle_name if teacher else "",
            "last_name": instance.last_name,
            "suffix": teacher.suffix if teacher else "",
            "full_name": teacher.full_name if teacher else (instance.get_full_name() or instance.username),
            "email": instance.email,
            "is_active": instance.is_active,
            "role": prof.role if prof else ("ADMIN" if instance.is_superuser else "TEACHER"),
            "contact_number": contact,
            "phone_number": contact,
            "employee_id": teacher.employee_id if teacher else "",
            "department": teacher.department_name if teacher else "",
            "position": teacher.position_title if teacher else "",
            "can_handle_classes": can_handle,
            "can_teach": can_handle,
            "photo": photo_url,
            "photo_url": photo_url,
            "teacher_id": teacher.id if teacher else None,
            "is_profile_completed": bool(instance.first_name and instance.last_name),
            "is_locked": bool(prof and prof.is_locked()),
        }

    @transaction.atomic
    def create(self, validated_data: dict):
        clean_role = validated_data.pop("role", "TEACHER")
        middle_name = clean_text(validated_data.pop("middle_name", ""), 100)
        suffix = clean_text(validated_data.pop("suffix", ""), 20)
        contact = normalize_ph_phone(validated_data.pop("contact_number", ""))
        employee_id = clean_text(validated_data.pop("employee_id", ""), 50)
        department = clean_text(validated_data.pop("department", ""), 100)
        position = clean_text(validated_data.pop("position", ""), 100)
        can_handle = bool(validated_data.pop("can_handle_classes", True))
        photo = validated_data.pop("photo", None)
        remove_photo = bool(validated_data.pop("remove_photo", False))
        password = validated_data.pop("password", None)

        validated_data["username"] = clean_text(validated_data.get("username", ""), 150)
        validated_data["first_name"] = clean_text(validated_data.get("first_name", ""), 100)
        validated_data["last_name"] = clean_text(validated_data.get("last_name", ""), 100)
        validated_data["email"] = clean_text(validated_data.get("email", ""), 150)

        user = User(**validated_data)
        user.is_staff = clean_role == "ADMIN"
        user.is_superuser = clean_role == "ADMIN"
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()

        profile, _ = UserProfile.objects.update_or_create(
            user=user,
            defaults={"role": clean_role},
        )

        try:
            emp_code = validate_unique_employee_id(
                employee_id or f"EMP-{user.id:04d}", required=True
            )
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"employee_id": exc.detail})

        teacher = TeacherProfile.objects.create(
            user=user,
            employee_id=emp_code,
            middle_name=middle_name,
            suffix=suffix,
            department=get_or_create_department(department),
            position=get_or_create_position(position),
            contact_number=contact,
            can_handle_classes=can_handle,
            photo=None if remove_photo else photo,
        )
        user.profile = profile
        user.teacher_profile = teacher
        return user

    @transaction.atomic
    def update(self, instance, validated_data: dict):
        clean_role = validated_data.pop("role", None)
        middle_name = validated_data.pop("middle_name", _UNSET)
        suffix = validated_data.pop("suffix", _UNSET)
        contact = validated_data.pop("contact_number", None)
        employee_id = validated_data.pop("employee_id", None)
        department = validated_data.pop("department", None)
        position = validated_data.pop("position", None)
        can_handle = validated_data.pop("can_handle_classes", None)
        photo = validated_data.pop("photo", _UNSET)
        remove_photo = bool(validated_data.pop("remove_photo", False))
        password = validated_data.pop("password", None)

        for field_name in ("username", "first_name", "last_name", "email"):
            if field_name in validated_data:
                validated_data[field_name] = clean_text(validated_data[field_name], 150)

        for attr, val in validated_data.items():
            setattr(instance, attr, val)

        profile, _ = UserProfile.objects.get_or_create(user=instance)
        if clean_role is not None:
            profile.role = clean_role
            instance.is_staff = clean_role == "ADMIN"
            instance.is_superuser = clean_role == "ADMIN"
            profile.save(update_fields=["role", "updated_at"])

        if password:
            instance.set_password(password)
        instance.save()

        teacher = getattr(instance, "teacher_profile", None)
        has_teacher_updates = any(
            v is not None and v is not _UNSET
            for v in (middle_name, suffix, contact, employee_id, department, position, can_handle, photo)
        ) or remove_photo
        if not teacher and has_teacher_updates:
            emp_code = clean_text(employee_id, 50) if employee_id else f"EMP-{instance.id:04d}"
            if TeacherProfile.objects.filter(employee_id__iexact=emp_code).exists():
                emp_code = f"EMP-{instance.id:04d}-{instance.id}"
            teacher = TeacherProfile.objects.create(user=instance, employee_id=emp_code)

        if teacher:
            if employee_id:
                try:
                    teacher.employee_id = validate_unique_employee_id(
                        employee_id, exclude_teacher_id=teacher.id, required=True
                    )
                except serializers.ValidationError as exc:
                    raise serializers.ValidationError({"employee_id": exc.detail})
            if middle_name is not _UNSET:
                teacher.middle_name = clean_text(middle_name, 100)
            if suffix is not _UNSET:
                teacher.suffix = clean_text(suffix, 20)
            if contact is not None:
                teacher.contact_number = normalize_ph_phone(contact)
            if department is not None:
                teacher.department = get_or_create_department(department)
            if position is not None:
                teacher.position = get_or_create_position(position)
            if can_handle is not None:
                teacher.can_handle_classes = bool(can_handle)
            if remove_photo or photo is None:
                teacher.photo = None
            elif photo is not _UNSET:
                teacher.photo = photo
            teacher.save()
            instance.teacher_profile = teacher

        instance.profile = profile
        return instance


AUDIT_MODULE_LABELS: dict[str, str] = {
    "auth_user": "Account",
    "user_profiles": "Account Security",
    "teacher_profiles": "Teachers",
    "departments": "Departments",
    "position_titles": "Positions",
    "students": "Students",
    "enrollments": "Enrollments",
    "sections": "Sections",
    "class_periods": "Class Schedules",
    "subjects": "Subjects",
    "rooms": "Classrooms",
    "buildings": "Buildings",
    "grade_levels": "Grade Levels",
    "school_years": "School Years",
    "school_settings": "School Settings",
    "school_holidays": "School Calendar",
    "campus_boundaries": "Campus Boundary",
    "loafing_incidents": "Campus Alerts",
    "teacher_daily_attendance": "Teacher Attendance",
    "teacher_location_pings": "Campus Location",
    "class_attendance": "Student Attendance",
    "daily_attendance": "Daily Attendance",
    "exit_passes": "Exit Passes",
    "teacher_monthly_dtr": "Monthly DTR",
    "deped_reports": "DepEd Reports",
    "edfi_export": "Division Export",
    "system_cache": "System Memory",
}

AUDIT_ACTION_LABELS: dict[str, str] = {
    "LOGIN": "Sign In",
    "LOGOUT": "Sign Out",
    "LOGIN_FAIL": "Failed Sign In",
    "LOCKOUT": "Account Locked",
    "LOCKED": "Locked Account Blocked",
    "UNLOCK_ALL": "Accounts Unlocked",
    "PROFILE": "Profile Updated",
    "PASSWORD": "Password Changed",
    "CREATE": "Created",
    "UPDATE": "Updated",
    "DELETE": "Deleted",
    "APPROVE": "Approved",
    "RESOLVE": "Resolved",
    "EXCUSE": "Excused",
    "SUBMIT": "Submitted",
    "VIEW": "Viewed",
    "BIO_ENROLL": "Phone Lock Enrolled",
    "BIO_REJECT": "Phone Lock Rejected",
    "DEV_REJECT": "Phone Binding Rejected",
    "RESET_DEV": "Phone Reset",
    "EXPORT": "Exported",
    "PRINT": "Printed",
    "IMPORT": "Imported",
    "FLUSH": "Cache Cleared",
}

AUDIT_FAILED_ACTIONS = {"LOCKOUT", "LOCKED", "LOGIN_FAIL", "BIO_REJECT", "DEV_REJECT"}
AUDIT_ACCOUNT_ACTIONS = {
    "LOGIN",
    "LOGOUT",
    "LOGIN_FAIL",
    "LOCKOUT",
    "LOCKED",
    "PASSWORD",
    "PROFILE",
    "UNLOCK_ALL",
}
_AUDIT_SENSITIVE_FIELD_NAMES = {"password", "token", "access", "refresh", "secret", "csrfmiddlewaretoken"}


def get_readable_audit_module(table_name: str, action: str = "") -> str:
    clean_table = str(table_name or "").strip().lower()
    if clean_table in AUDIT_MODULE_LABELS:
        return AUDIT_MODULE_LABELS[clean_table]
    if clean_table:
        return clean_table.replace("_", " ").strip().title()
    return "Account" if str(action or "").strip().upper() in AUDIT_ACCOUNT_ACTIONS else "System"


def get_readable_audit_action(action: str) -> str:
    code = str(action or "").strip().upper()
    if code in AUDIT_ACTION_LABELS:
        return AUDIT_ACTION_LABELS[code]
    return code.replace("_", " ").title() if code else "Activity"


def _extract_audit_changes_dict(obj: AuditLog) -> dict:
    merged: dict = {}
    if isinstance(obj.new_data, dict):
        merged.update(obj.new_data)
    if isinstance(obj.changed_fields, list) and obj.changed_fields:
        merged["changed_fields"] = list(obj.changed_fields)
    return merged


def _build_audit_summary(obj: AuditLog) -> str:
    action = str(obj.action or "").strip().upper()
    module_label = get_readable_audit_module(obj.table_name, action)
    data = obj.new_data if isinstance(obj.new_data, dict) else {}

    raw_fields = (
        obj.changed_fields
        if isinstance(obj.changed_fields, list)
        else data.get("changed_fields")
        if isinstance(data.get("changed_fields"), list)
        else []
    )
    safe_fields = [
        str(f).replace("_", " ").strip()
        for f in raw_fields
        if str(f).strip().lower() not in _AUDIT_SENSITIVE_FIELD_NAMES
    ]
    fields_text = ", ".join(safe_fields[:6])
    if len(safe_fields) > 6:
        fields_text += f", +{len(safe_fields) - 6} more"

    record_ref = f" #{obj.record_id}" if obj.record_id else ""

    if action == "LOGIN":
        uname = str(data.get("username") or "").strip()
        role = str(data.get("role") or "").strip()
        if str(data.get("mode") or "").upper() == "DEMO":
            return f"Signed in with demo preview as {uname}." if uname else "Signed in with demo preview."
        if uname and role:
            return f"Signed in as {uname} ({role})."
        if uname:
            return f"Signed in as {uname}."
        return "Signed in to AttendSure."

    if action == "LOGOUT":
        uname = str(data.get("username") or "").strip()
        return f"Signed out of account {uname}." if uname else "Signed out of AttendSure."

    if action == "LOCKOUT":
        uname = str(data.get("username") or "account").strip()
        tries = data.get("failed_login_attempts") or 5
        return f"Account {uname} was temporarily locked after {tries} failed sign-in tries."

    if action == "LOCKED":
        uname = str(data.get("username") or "account").strip()
        return f"Blocked a sign-in try while account {uname} is temporarily locked."

    if action == "LOGIN_FAIL":
        uname = str(data.get("username") or "account").strip()
        tries = data.get("failed_login_attempts")
        suffix = f" (attempt {tries})" if tries else ""
        return f"Failed sign-in try for {uname}{suffix}."

    if action == "UNLOCK_ALL":
        count = data.get("unlocked_count", 0)
        return f"Unlocked {count} locked account(s)."

    if action == "PASSWORD":
        return "Changed account password."

    if action == "PROFILE":
        if fields_text:
            return f"Updated personal profile ({fields_text})."
        return "Updated personal profile details."

    if action == "BIO_ENROLL":
        emp = str(data.get("employee_id") or "").strip()
        return f"Enrolled phone screen lock for teacher {emp}." if emp else "Enrolled phone screen lock for teacher check-in."

    if action == "BIO_REJECT":
        emp = str(data.get("employee_id") or "").strip()
        target = f"teacher {emp}" if emp else f"teacher{record_ref}"
        return f"Rejected a mismatched phone security check for {target}."

    if action == "DEV_REJECT":
        emp = str(data.get("employee_id") or "").strip()
        target = f"teacher {emp}" if emp else f"teacher{record_ref}"
        return f"Blocked pairing a phone already linked to another teacher for {target}."

    if action == "RESET_DEV":
        emp = str(data.get("employee_id") or "").strip()
        target = f"teacher {emp}" if emp else f"teacher{record_ref}"
        return f"Cleared paired phone lock for {target}."

    if action in ("EXPORT", "PRINT"):
        verb = "Printed" if action == "PRINT" else "Exported"
        report_name = str(data.get("report_name") or "").strip()
        if report_name:
            tracking = str(data.get("tracking_id") or "").strip()
            return f"{verb} {report_name}" + (f" (Tracking ID: {tracking})" if tracking else "") + "."
        pack_type = str(data.get("pack_type") or "").strip()
        if pack_type:
            pack_label = pack_type.replace("_", " ").title()
            fmt = str(data.get("export_format") or "").strip().upper()
            return f"{verb} {pack_label}" + (f" ({fmt})" if fmt else "") + "."
        if str(obj.table_name or "").lower() == "edfi_export":
            fmt = str(data.get("format") or "JSON").strip().upper()
            days = data.get("days")
            return f"{verb} Division Data ({fmt}" + (f", last {days} days" if days else "") + ")."
        return f"{verb} {module_label.lower()} document."

    if action == "IMPORT":
        created = data.get("created", 0)
        updated = data.get("updated", 0)
        skipped = data.get("skipped", 0)
        return f"Imported students: {created} added, {updated} updated, {skipped} skipped."

    if action == "RESOLVE":
        next_status = str(data.get("status") or "").replace("_", " ").title()
        remarks = str(data.get("remarks") or "").strip()
        base = f"Resolved campus alert{record_ref}" + (f" as {next_status}" if next_status else "")
        return f"{base} — {remarks}" if remarks else f"{base}."

    if action == "EXCUSE":
        date_val = str(data.get("date") or "").strip()
        remarks = str(data.get("remarks") or "").strip()
        base = f"Excused campus alert" + (f" for {date_val}" if date_val else "")
        return f"{base} — {remarks}" if remarks else f"{base}."

    if action == "APPROVE":
        pass_num = str(data.get("pass_number") or "").strip()
        if pass_num:
            return f"Approved exit pass {pass_num}."
        if data.get("month") and data.get("year"):
            return f"Approved monthly DTR for {data['month']}/{data['year']}."
        return f"Approved {module_label.lower()} record{record_ref}."

    if action == "SUBMIT":
        if data.get("month") and data.get("year"):
            return f"Submitted monthly DTR for {data['month']}/{data['year']}."
        return f"Submitted {module_label.lower()} record{record_ref}."

    if action == "FLUSH":
        return "Cleared server memory cache."

    if action == "VIEW":
        return f"Viewed {module_label.lower()}{record_ref}."

    if action in ("CREATE", "UPDATE", "DELETE"):
        verb = {"CREATE": "Added", "UPDATE": "Updated", "DELETE": "Removed"}[action]
        if str(obj.table_name or "").lower() == "campus_boundaries" and data.get("campus_name"):
            radius = data.get("radius_meters")
            return f"Updated campus boundary for {data['campus_name']}" + (
                f" ({radius}m radius)." if radius else "."
            )
        if str(obj.table_name or "").lower() == "class_attendance" and data.get("status"):
            return f"{verb} student attendance status to {data['status']}."
        if fields_text:
            return f"{verb} {module_label.lower()} record{record_ref} ({fields_text})."
        kv_parts = [
            f"{str(k).replace('_', ' ')}: {v}"
            for k, v in data.items()
            if str(k).lower() not in _AUDIT_SENSITIVE_FIELD_NAMES
            and str(k) != "changed_fields"
            and v not in (None, "", [], {})
        ]
        if kv_parts:
            return f"{verb} {module_label.lower()} record{record_ref} ({', '.join(kv_parts[:4])})."
        return f"{verb} {module_label.lower()} record{record_ref}."

    action_label = get_readable_audit_action(action)
    return f"{action_label} in {module_label}{record_ref}."


class AuditLogSerializer(serializers.ModelSerializer):
    """Serializes 3NF AuditLog rows with clear, everyday labels and computed summary fields."""

    created_at = serializers.SerializerMethodField()
    timestamp = serializers.SerializerMethodField()
    date_only = serializers.SerializerMethodField()
    time_only = serializers.SerializerMethodField()
    action_label = serializers.SerializerMethodField()
    target_model = serializers.CharField(source="table_name", read_only=True)
    target_id = serializers.IntegerField(source="record_id", read_only=True)
    module = serializers.SerializerMethodField()
    changes = serializers.SerializerMethodField()
    details = serializers.SerializerMethodField()
    actor_username = serializers.SerializerMethodField()
    actor_name = serializers.SerializerMethodField()
    performed_by = serializers.SerializerMethodField()
    user = serializers.SerializerMethodField()
    client_ip = serializers.SerializerMethodField()
    ip_address = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "created_at",
            "timestamp",
            "date_only",
            "time_only",
            "action",
            "action_label",
            "table_name",
            "target_model",
            "module",
            "record_id",
            "target_id",
            "changed_fields",
            "new_data",
            "changes",
            "details",
            "actor_username",
            "actor_name",
            "performed_by",
            "user",
            "client_ip",
            "ip_address",
            "user_agent",
            "status",
        ]

    def _local_dt(self, obj: AuditLog):
        return timezone.localtime(obj.created_at)

    def get_created_at(self, obj: AuditLog) -> str:
        return self._local_dt(obj).isoformat()

    def get_date_only(self, obj: AuditLog) -> str:
        local_dt = self._local_dt(obj)
        return f"{local_dt.strftime('%b')} {local_dt.day}, {local_dt.year}"

    def get_time_only(self, obj: AuditLog) -> str:
        local_dt = self._local_dt(obj)
        return local_dt.strftime("%I:%M %p").lstrip("0")

    def get_timestamp(self, obj: AuditLog) -> str:
        return f"{self.get_date_only(obj)} • {self.get_time_only(obj)}"

    def get_action_label(self, obj: AuditLog) -> str:
        return get_readable_audit_action(obj.action)

    def get_module(self, obj: AuditLog) -> str:
        return get_readable_audit_module(obj.table_name, obj.action)

    def get_changes(self, obj: AuditLog) -> dict:
        return _extract_audit_changes_dict(obj)

    def get_details(self, obj: AuditLog) -> str:
        return _build_audit_summary(obj)

    def get_actor_username(self, obj: AuditLog) -> str:
        return obj.performed_by.username if obj.performed_by else "system"

    def get_actor_name(self, obj: AuditLog) -> str:
        if not obj.performed_by:
            return "System"
        return (obj.performed_by.get_full_name() or obj.performed_by.username).strip()

    def get_performed_by(self, obj: AuditLog) -> str:
        return self.get_actor_name(obj)

    def get_user(self, obj: AuditLog) -> str:
        return self.get_actor_name(obj)

    def get_client_ip(self, obj: AuditLog) -> str:
        return obj.client_ip or ""

    def get_ip_address(self, obj: AuditLog) -> str:
        return obj.client_ip or ""

    def get_status(self, obj: AuditLog) -> str:
        action = str(obj.action or "").strip().upper()
        return "FAILED" if action in AUDIT_FAILED_ACTIONS else "SUCCESS"
