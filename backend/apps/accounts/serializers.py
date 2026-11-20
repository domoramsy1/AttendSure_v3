import secrets
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from rest_framework import serializers
from common.media import FlexibleImageField, build_media_url
from common.permissions import get_user_role
from common.phone import normalize_ph_phone
from .models import TeacherProfile, UserProfile
from .services import user_session_cache_key

User = get_user_model()


class TeacherDropdownSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = TeacherProfile
        fields = [
            "id", "employee_id", "first_name", "last_name", "suffix",
            "full_name", "department", "position", "contact_number",
            "email", "can_teach", "is_active", "photo_url",
        ]

    def get_photo_url(self, obj):
        return build_media_url(obj.photo, self.context.get("request"))


class TeacherSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    photo = FlexibleImageField(required=False, allow_null=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = TeacherProfile
        fields = [
            "id", "employee_id", "first_name", "middle_name", "last_name", "suffix",
            "full_name", "email", "contact_number", "position", "department",
            "can_teach", "is_active", "qr_token", "bound_device_id",
            "device_model", "device_bound_at", "photo", "photo_url",
        ]
        extra_kwargs = {
            "qr_token": {"required": False, "allow_blank": True, "allow_null": True},
            "bound_device_id": {"required": False, "allow_blank": True, "allow_null": True},
        }

    def validate_employee_id(self, value):
        return value.strip().upper()

    def get_photo_url(self, obj):
        return build_media_url(obj.photo, self.context.get("request"))


class UserAccountSerializer(serializers.ModelSerializer):
    role = serializers.CharField(required=False, default="FACULTY")
    is_teaching = serializers.BooleanField(required=False, default=True)
    employee_id = serializers.CharField(required=False, allow_blank=True)
    contact_number = serializers.CharField(required=False, allow_blank=True)
    department = serializers.CharField(required=False, allow_blank=True)
    position = serializers.CharField(required=False, allow_blank=True)
    photo = FlexibleImageField(required=False, allow_null=True)
    photo_url = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "employee_id", "first_name", "last_name", "email",
            "contact_number", "department", "position", "role", "is_teaching",
            "photo", "photo_url", "is_active", "password",
        ]

    def get_photo_url(self, obj):
        prof = getattr(obj, "profile", None)
        if prof and prof.teacher and prof.teacher.photo:
            return build_media_url(prof.teacher.photo, self.context.get("request"))
        return build_media_url(prof.avatar if prof else None, self.context.get("request"))

    def to_representation(self, instance):
        data = super().to_representation(instance)
        prof = getattr(instance, "profile", None)
        teacher = prof.teacher if prof else None
        role = prof.role if prof else ("ADMIN" if instance.is_superuser else "FACULTY")
        is_teaching = False if role == "PARENT" else (prof.is_teaching if prof else True)
        phone = (prof.phone_number if prof else "") or (teacher.contact_number if teacher else "")

        data["role"] = role
        data["current_role"] = "FACULTY_ADMIN" if (role == "ADMIN" and is_teaching) else role
        data["is_teaching"] = is_teaching
        data["can_teach"] = is_teaching
        data["faculty_id"] = prof.teacher_id if prof else None
        data["employee_id"] = teacher.employee_id if teacher else instance.username
        data["contact_number"] = phone
        data["phone_number"] = phone
        data["department"] = teacher.department if teacher else ""
        data["position"] = teacher.position if teacher else role.title()
        data["full_name"] = teacher.full_name if teacher else (instance.get_full_name() or instance.username)
        return data

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop("password", "")
        raw_role = str(validated_data.pop("role", "FACULTY")).upper()
        role = "ADMIN" if raw_role == "FACULTY_ADMIN" else raw_role
        is_teaching = False if role == "PARENT" else bool(validated_data.pop("is_teaching", True))
        emp_id = str(validated_data.pop("employee_id", "") or validated_data["username"]).strip().upper()
        phone = normalize_ph_phone(validated_data.pop("contact_number", ""))
        dept = validated_data.pop("department", "Junior High School")
        pos = validated_data.pop("position", "Faculty I")
        photo = validated_data.pop("photo", None)

        user = User(**validated_data, is_staff=(role == "ADMIN"), is_superuser=(role == "ADMIN"))
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()

        profile, _ = UserProfile.objects.update_or_create(
            user=user,
            defaults={
                "role": role,
                "phone_number": phone,
                "is_teaching": is_teaching,
                "is_profile_completed": bool(user.first_name and user.last_name),
                **({"avatar": photo} if photo else {}),
            },
        )

        if role != "PARENT":
            teacher, _ = TeacherProfile.objects.update_or_create(
                employee_id=emp_id[:50],
                defaults={
                    "first_name": user.first_name or user.username,
                    "last_name": user.last_name or "Staff",
                    "email": user.email or "",
                    "contact_number": phone,
                    "department": dept,
                    "position": pos,
                    "can_teach": is_teaching,
                    "is_active": user.is_active,
                    "qr_token": secrets.token_urlsafe(24),
                },
            )
            profile.teacher = teacher
            profile.save(update_fields=["teacher"])
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        request = self.context.get("request")
        is_admin = bool(
            request and request.user.is_authenticated
            and (request.user.is_superuser or get_user_role(request.user) == "ADMIN")
        )

        password = validated_data.pop("password", "")
        raw_role = validated_data.pop("role", None)
        is_teaching = validated_data.pop("is_teaching", None)
        phone = validated_data.pop("contact_number", None)
        dept = validated_data.pop("department", None)
        pos = validated_data.pop("position", None)
        emp_id = validated_data.pop("employee_id", None)
        has_photo = "photo" in validated_data
        photo = validated_data.pop("photo", None)

        if not is_admin:
            validated_data.pop("is_active", None)
            raw_role = None

        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        if password:
            instance.set_password(password)
        instance.save()

        profile, _ = UserProfile.objects.get_or_create(user=instance)
        if raw_role and is_admin:
            clean_role = str(raw_role).upper()
            profile.role = "ADMIN" if clean_role == "FACULTY_ADMIN" else clean_role
            instance.is_staff = profile.role == "ADMIN"
            instance.is_superuser = profile.role == "ADMIN"
            instance.save(update_fields=["is_staff", "is_superuser"])

        if is_teaching is not None and is_admin:
            profile.is_teaching = False if profile.role == "PARENT" else bool(is_teaching)
        if phone is not None:
            profile.phone_number = normalize_ph_phone(phone)
        if has_photo:
            profile.avatar = photo
        profile.is_profile_completed = bool(instance.first_name and instance.last_name)
        profile.save()

        if profile.teacher:
            t = profile.teacher
            t.first_name = instance.first_name or t.first_name
            t.last_name = instance.last_name or t.last_name
            t.email = instance.email or t.email
            if emp_id is not None and str(emp_id).strip():
                clean_emp = str(emp_id).strip().upper()[:50]
                if clean_emp != t.employee_id:
                    if TeacherProfile.objects.filter(employee_id__iexact=clean_emp).exclude(id=t.id).exists():
                        raise serializers.ValidationError({"employee_id": "Employee ID is already assigned to another faculty member."})
                    t.employee_id = clean_emp
            if phone is not None:
                t.contact_number = profile.phone_number
            if dept is not None:
                t.department = dept
            if pos is not None:
                t.position = pos
            if has_photo:
                if photo and hasattr(photo, "seek"):
                    photo.seek(0)
                t.photo = photo
            t.can_teach = profile.is_teaching
            t.is_active = instance.is_active
            t.save()
            profile.teacher = t

        instance.profile = profile
        cache.delete(user_session_cache_key(instance.id))
        return instance