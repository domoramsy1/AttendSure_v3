from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils.html import strip_tags
from rest_framework import serializers

from common.phone import normalize_ph_phone
from .models import FacultyProfile, UserProfile

User = get_user_model()


def _clean_str(val: object, max_len: int = 150) -> str:
    return strip_tags(str(val or "")).strip()[:max_len]


class FacultyDropdownSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    department = serializers.CharField(read_only=True)
    position = serializers.CharField(read_only=True)

    class Meta:
        model = FacultyProfile
        fields = [
            "id",
            "employee_id",
            "full_name",
            "first_name",
            "last_name",
            "department",
            "position",
            "can_handle_classes",
            "is_active",
        ]


class FacultyProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    department = serializers.CharField(required=False, allow_blank=True, default="")
    position = serializers.CharField(required=False, allow_blank=True, default="")
    photo_url = serializers.SerializerMethodField()
    has_bound_device = serializers.SerializerMethodField()

    class Meta:
        model = FacultyProfile
        fields = [
            "id",
            "employee_id",
            "first_name",
            "middle_name",
            "last_name",
            "suffix",
            "full_name",
            "department",
            "position",
            "contact_number",
            "email",
            "photo",
            "photo_url",
            "can_handle_classes",
            "qr_token",
            "is_active",
            "bound_device_id",
            "device_model",
            "device_bound_at",
            "has_bound_device",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "qr_token", "device_bound_at", "created_at", "updated_at"]

    def get_photo_url(self, obj: FacultyProfile) -> str | None:
        if not obj.photo:
            return None
        request = self.context.get("request")
        url = obj.photo.url
        return request.build_absolute_uri(url) if request else url

    def get_has_bound_device(self, obj: FacultyProfile) -> bool:
        return bool(obj.bound_device_id)

    def validate_employee_id(self, value: str) -> str:
        clean = _clean_str(value, 50)
        if not clean:
            raise serializers.ValidationError("Employee ID is required.")
        qs = FacultyProfile.objects.filter(employee_id__iexact=clean)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This Employee ID is already assigned.")
        return clean

    @transaction.atomic
    def create(self, validated_data: dict) -> FacultyProfile:
        dept = validated_data.pop("department", "")
        pos = validated_data.pop("position", "")
        faculty = FacultyProfile(**validated_data)
        faculty.department = dept
        faculty.position = pos
        faculty.save()
        return faculty

    @transaction.atomic
    def update(self, instance: FacultyProfile, validated_data: dict) -> FacultyProfile:
        if "department" in validated_data:
            instance.department = validated_data.pop("department")
        if "position" in validated_data:
            instance.position = validated_data.pop("position")
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        return instance


class UserAccountSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)
    role = serializers.CharField(required=False, default="FACULTY")
    phone_number = serializers.CharField(required=False, allow_blank=True, default="")
    employee_id = serializers.CharField(required=False, allow_blank=True, default="")
    department = serializers.CharField(required=False, allow_blank=True, default="")
    position = serializers.CharField(required=False, allow_blank=True, default="")
    can_handle_classes = serializers.BooleanField(required=False, default=True)
    faculty_id = serializers.IntegerField(source="profile.faculty_id", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "password",
            "first_name",
            "last_name",
            "email",
            "is_active",
            "role",
            "phone_number",
            "employee_id",
            "department",
            "position",
            "can_handle_classes",
            "faculty_id",
        ]

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        prof = getattr(instance, "profile", None)
        fac = getattr(prof, "faculty", None) if prof else None
        data["role"] = prof.role if prof else ("ADMIN" if instance.is_superuser else "FACULTY")
        data["phone_number"] = (
            prof.phone_number if (prof and prof.phone_number) else (fac.contact_number if fac else "")
        )
        data["employee_id"] = fac.employee_id if fac else ""
        data["department"] = fac.department if fac else ""
        data["position"] = fac.position if fac else ""
        data["can_handle_classes"] = bool(prof.handles_classes) if prof else True
        data["faculty_id"] = fac.id if fac else None
        data["is_profile_completed"] = bool(prof and prof.is_profile_completed)
        return data

    @transaction.atomic
    def create(self, validated_data: dict):
        raw_role = str(validated_data.pop("role", "FACULTY") or "FACULTY").upper()
        clean_role = "ADMIN" if raw_role in ("SUPERADMIN", "FACULTY_ADMIN") else raw_role
        phone = normalize_ph_phone(validated_data.pop("phone_number", ""))
        employee_id = _clean_str(validated_data.pop("employee_id", ""), 50)
        department = _clean_str(validated_data.pop("department", ""), 100)
        position = _clean_str(validated_data.pop("position", ""), 100)
        can_handle = bool(validated_data.pop("can_handle_classes", True))
        password = validated_data.pop("password", None)

        user = User(**validated_data)
        user.is_staff = clean_role == "ADMIN"
        user.is_superuser = clean_role == "ADMIN"
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()

        faculty_obj = None
        if clean_role != "PARENT":
            emp_code = employee_id or f"EMP-{user.id:04d}"
            faculty_obj, _ = FacultyProfile.objects.update_or_create(
                employee_id=emp_code,
                defaults={
                    "first_name": user.first_name or user.username,
                    "last_name": user.last_name or "Staff",
                    "email": user.email or "",
                    "contact_number": phone,
                    "can_handle_classes": can_handle,
                    "is_active": user.is_active,
                },
            )
            if department:
                faculty_obj.department = department
            if position:
                faculty_obj.position = position
            faculty_obj.save()

        profile, _ = UserProfile.objects.update_or_create(
            user=user,
            defaults={
                "role": clean_role,
                "faculty": faculty_obj,
                "phone_number": phone,
                "is_profile_completed": bool(user.first_name and user.last_name),
            },
        )
        user.profile = profile
        return user

    @transaction.atomic
    def update(self, instance, validated_data: dict):
        raw_role = validated_data.pop("role", None)
        phone = validated_data.pop("phone_number", None)
        employee_id = validated_data.pop("employee_id", None)
        department = validated_data.pop("department", None)
        position = validated_data.pop("position", None)
        can_handle = validated_data.pop("can_handle_classes", None)
        password = validated_data.pop("password", None)

        for attr, val in validated_data.items():
            setattr(instance, attr, val)

        profile, _ = UserProfile.objects.get_or_create(user=instance)
        if raw_role is not None:
            clean_role = str(raw_role).upper()
            profile.role = "ADMIN" if clean_role in ("SUPERADMIN", "FACULTY_ADMIN") else clean_role
            instance.is_staff = profile.role == "ADMIN"
            instance.is_superuser = profile.role == "ADMIN"

        if password:
            instance.set_password(password)
        instance.save()

        if phone is not None:
            profile.phone_number = normalize_ph_phone(phone)
        profile.is_profile_completed = bool(instance.first_name and instance.last_name)
        profile.save()

        if profile.faculty:
            fac = profile.faculty
            fac.first_name = instance.first_name or fac.first_name
            fac.last_name = instance.last_name or fac.last_name
            fac.email = instance.email or fac.email
            if employee_id:
                clean_emp = _clean_str(employee_id, 50)
                if (
                    FacultyProfile.objects.filter(employee_id__iexact=clean_emp)
                    .exclude(id=fac.id)
                    .exists()
                ):
                    raise serializers.ValidationError(
                        {"employee_id": "This Employee ID is already assigned."}
                    )
                fac.employee_id = clean_emp
            if phone is not None:
                fac.contact_number = profile.phone_number
            if department is not None:
                fac.department = department
            if position is not None:
                fac.position = position
            if can_handle is not None:
                fac.can_handle_classes = False if profile.role == "PARENT" else bool(can_handle)
            fac.is_active = instance.is_active
            fac.save()

        instance.profile = profile
        return instance