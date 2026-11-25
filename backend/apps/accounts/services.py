# AttendSure Backend - Accounts Business Logic Services
# File: D:\AttendSure_V3\backend\apps\accounts\services.py

# D:\AttendSure_V3\backend\apps\accounts\services.py
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers as drf_serializers
from rest_framework_simplejwt.tokens import RefreshToken

from common.audit import record_audit_log
from common.exceptions import AppError
from common.media import build_media_url, decode_uploaded_image
from common.permissions import ALLOWED_ROLES, get_user_role
from common.phone import normalize_ph_phone
from common.validators import (
    clean_text,
    validate_unique_teacher_phone,
    validate_unique_user_email,
)
from .models import SUFFIX_CHOICES, Department, PositionTitle, TeacherProfile, UserProfile
from .selectors import resolve_teacher_for_user

User = get_user_model()
VALID_SUFFIXES = {choice[0] for choice in SUFFIX_CHOICES}


def get_or_create_department(name: str) -> Department | None:
    clean = clean_text(name, 100)
    if not clean:
        return None
    existing = Department.objects.filter(name__iexact=clean).first()
    if existing:
        return existing
    return Department.objects.create(name=clean)


def get_or_create_position(title: str) -> PositionTitle | None:
    clean = clean_text(title, 100)
    if not clean:
        return None
    existing = PositionTitle.objects.filter(title__iexact=clean).first()
    if existing:
        return existing
    return PositionTitle.objects.create(title=clean)


def build_user_session_payload(*, user, request=None) -> dict:
    """Builds the authenticated teacher/leader session payload in minimal queries."""
    profile = getattr(user, "profile", None) or UserProfile.objects.filter(user=user).first()
    teacher = resolve_teacher_for_user(user)
    role = profile.role if (profile and profile.role in ALLOWED_ROLES) else get_user_role(user)
    can_handle_classes = bool(teacher.can_handle_classes) if teacher else (role == "TEACHER")
    photo_url = build_media_url(teacher.photo, request) if (teacher and teacher.photo) else None

    full_name = teacher.full_name if teacher else (user.get_full_name() or user.username).strip()
    current_onboarding_version = int(getattr(settings, "ONBOARDING_CURRENT_VERSION", 1) or 1)
    onboarding_completed = bool(profile and profile.onboarding_completed)
    onboarding_version = int(profile.onboarding_version) if profile else 0
    onboarding_completed_at = (
        timezone.localtime(profile.onboarding_completed_at).isoformat()
        if (profile and profile.onboarding_completed_at)
        else None
    )
    needs_onboarding = (not onboarding_completed) or (onboarding_version < current_onboarding_version)

    return {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name or "",
        "middle_name": teacher.middle_name if teacher else "",
        "last_name": user.last_name or "",
        "suffix": teacher.suffix if teacher else "",
        "full_name": full_name,
        "teacher_name": full_name,
        "email": user.email or "",
        "role": role,
        "teacher_id": teacher.id if teacher else None,
        "employee_id": teacher.employee_id if teacher else "",
        "department": teacher.department_name if teacher else "",
        "department_name": teacher.department_name if teacher else "",
        "position": teacher.position_title if teacher else "",
        "position_title": teacher.position_title if teacher else "",
        "contact_number": teacher.contact_number if teacher else "",
        "phone_number": teacher.contact_number if teacher else "",
        "photo": photo_url,
        "photo_url": photo_url,
        "can_handle_classes": can_handle_classes,
        "can_teach": can_handle_classes,
        "has_bound_device": bool(teacher and teacher.bound_device_id),
        "has_biometric_enrolled": bool(teacher and teacher.biometric_key_id),
        "has_asymmetric_key": bool(teacher and (teacher.biometric_public_key or "").strip()),
        "device_model": teacher.device_model if teacher else None,
        "is_profile_completed": bool(user.first_name and user.last_name),
        "onboarding_completed": onboarding_completed,
        "onboarding_completed_at": onboarding_completed_at,
        "onboarding_version": onboarding_version,
        "current_onboarding_version": current_onboarding_version,
        "needs_onboarding": needs_onboarding,
        "is_staff": bool(user.is_staff),
        "is_superuser": bool(user.is_superuser),
    }


def authenticate_with_identifier(*, identifier: str, password: str, request=None) -> dict:
    clean_identifier = clean_text(identifier, 150)
    if not clean_identifier or not password:
        raise AppError("MISSING_CREDENTIALS", "Username or Employee ID and password are required.", 400)

    normalized_phone = normalize_ph_phone(clean_identifier)
    lookup = (
        Q(username__iexact=clean_identifier)
        | Q(email__iexact=clean_identifier)
        | Q(teacher_profile__employee_id__iexact=clean_identifier)
    )
    if normalized_phone:
        lookup = lookup | Q(teacher_profile__contact_number=normalized_phone)

    existing_user = (
        User.objects.select_related(
            "profile",
            "teacher_profile",
            "teacher_profile__department",
            "teacher_profile__position",
        )
        .filter(lookup)
        .first()
    )

    profile = None
    if existing_user:
        profile, _ = UserProfile.objects.get_or_create(
            user=existing_user,
            defaults={"role": "ADMIN" if existing_user.is_superuser else "TEACHER"},
        )
        if profile.role not in ALLOWED_ROLES:
            raise AppError(
                "FORBIDDEN_ROLE",
                "Only authorized school teachers and administrators can sign in to AttendSure.",
                403,
            )
        if profile.is_locked():
            record_audit_log(
                request=request,
                table_name="user_profiles",
                record_id=existing_user.id,
                action="LOCKED",
                new_data={"username": existing_user.username},
            )
            raise AppError(
                "ACCOUNT_LOCKED",
                "Account temporarily locked after 5 failed sign-in attempts. Please wait 15 minutes or ask an administrator to unlock it.",
                403,
            )

    target_username = existing_user.username if existing_user else clean_identifier
    authenticated_user = authenticate(request=request, username=target_username, password=password)

    if not authenticated_user:
        if profile and existing_user:
            just_locked = profile.record_failed_attempt()
            record_audit_log(
                request=request,
                table_name="user_profiles",
                record_id=existing_user.id,
                action="LOCKOUT" if just_locked else "LOGIN_FAIL",
                new_data={
                    "username": existing_user.username,
                    "failed_login_attempts": profile.failed_login_attempts,
                },
            )
            if just_locked:
                raise AppError(
                    "ACCOUNT_LOCKED",
                    "Account locked for 15 minutes after 5 failed sign-in attempts.",
                    403,
                )
        raise AppError("INVALID_CREDENTIALS", "Invalid account credentials.", 401)

    if not authenticated_user.is_active:
        raise AppError("INACTIVE_ACCOUNT", "This account is currently deactivated.", 403)

    if profile:
        profile.reset_failed_attempts()

    refresh = RefreshToken.for_user(authenticated_user)
    user_payload = build_user_session_payload(user=authenticated_user, request=request)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": user_payload,
    }


@transaction.atomic
def update_own_profile(*, user, data: dict, files=None, request=None) -> dict:
    first_name = clean_text(data.get("first_name", user.first_name), 100)
    last_name = clean_text(data.get("last_name", user.last_name), 100)
    teacher = resolve_teacher_for_user(user)

    raw_email = data.get("email", user.email)
    try:
        email = validate_unique_user_email(raw_email, exclude_user_id=user.pk)
    except drf_serializers.ValidationError:
        raise AppError("EMAIL_TAKEN", "This email address is already in use.", 400)

    raw_phone = data.get("contact_number") if "contact_number" in data else data.get("phone_number")
    contact = None
    if raw_phone is not None:
        try:
            contact = validate_unique_teacher_phone(
                raw_phone, exclude_teacher_id=teacher.id if teacher else None
            )
        except drf_serializers.ValidationError:
            raise AppError(
                "PHONE_TAKEN",
                "This mobile number is already assigned to another staff account.",
                400,
            )

    user.first_name = first_name
    user.last_name = last_name
    user.email = email
    user.save(update_fields=["first_name", "last_name", "email"])

    uploaded_file = (files.get("photo") or files.get("avatar")) if files else None
    raw_photo = uploaded_file if uploaded_file is not None else (
        data.get("photo") if "photo" in data else data.get("avatar")
    )
    explicit_clear = (
        str(data.get("remove_photo", "")).lower() in ("1", "true", "yes")
        or str(data.get("clear_photo", "")).lower() in ("1", "true", "yes")
        or (
            uploaded_file is None
            and ("photo" in data or "avatar" in data)
            and raw_photo in (None, "", "null", "undefined")
        )
    )

    if not teacher:
        emp_code = f"EMP-{user.id:04d}"
        if TeacherProfile.objects.filter(employee_id__iexact=emp_code).exists():
            emp_code = f"EMP-{user.id:04d}-{user.id}"
        teacher = TeacherProfile.objects.create(user=user, employee_id=emp_code)
        setattr(user, "_resolved_teacher_profile", teacher)

    if "middle_name" in data:
        teacher.middle_name = clean_text(data.get("middle_name", ""), 100)
    if "suffix" in data:
        suffix = clean_text(data.get("suffix", ""), 20)
        teacher.suffix = suffix if suffix in VALID_SUFFIXES else ""
    if contact is not None:
        teacher.contact_number = contact
    if "department" in data or "department_name" in data:
        dept_val = data.get("department") if "department" in data else data.get("department_name")
        teacher.department = get_or_create_department(str(dept_val or ""))
    if "position" in data or "position_title" in data:
        pos_val = data.get("position") if "position" in data else data.get("position_title")
        teacher.position = get_or_create_position(str(pos_val or ""))
    if explicit_clear:
        teacher.photo = None
    elif raw_photo is not None:
        decoded = decode_uploaded_image(raw_photo, prefix="teacher")
        if decoded is None:
            teacher.photo = None
        elif not isinstance(decoded, drf_serializers.SkipField):
            teacher.photo = decoded
    teacher.save()
    setattr(user, "_resolved_teacher_profile", teacher)

    return build_user_session_payload(user=user, request=request)


@transaction.atomic
def reset_teacher_bound_device(*, teacher_id: int) -> TeacherProfile:
    teacher = TeacherProfile.objects.select_related("user").filter(id=teacher_id).first()
    if not teacher:
        raise AppError("TEACHER_NOT_FOUND", "Teacher profile not found.", 404)
    teacher.bound_device_id = None
    teacher.device_model = None
    teacher.device_bound_at = None
    teacher.biometric_key_id = None
    teacher.biometric_public_key = ""
    teacher.biometric_key_algorithm = ""
    teacher.save(
        update_fields=[
            "bound_device_id",
            "device_model",
            "device_bound_at",
            "biometric_key_id",
            "biometric_public_key",
            "biometric_key_algorithm",
            "updated_at",
        ]
    )
    return teacher


@transaction.atomic
def unlock_all_locked_accounts() -> int:
    """Clears failed sign-in counters and temporary lockouts across all UserProfiles."""
    return UserProfile.objects.filter(
        Q(failed_login_attempts__gt=0) | Q(locked_until__isnull=False)
    ).update(failed_login_attempts=0, locked_until=None)
