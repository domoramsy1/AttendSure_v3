from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers
from rest_framework.authtoken.models import Token
from rest_framework_simplejwt.tokens import RefreshToken

from common.exceptions import AppError
from common.media import build_media_url, decode_uploaded_image
from common.permissions import get_user_role
from apps.school.models import ClassPeriod
from apps.school.selectors import get_school_metadata
from .models import TeacherProfile, UserProfile
from .selectors import resolve_teacher_for_user

User = get_user_model()


def user_session_cache_key(user_id: int) -> str:
    return f"accounts:me:{user_id}"


def build_user_session_payload(user, request=None) -> dict:
    cache_key = user_session_cache_key(user.id)
    cached = cache.get(cache_key)
    if cached is None:
        teacher = resolve_teacher_for_user(user)
        profile = getattr(user, "profile", None)
        role = get_user_role(user)
        class_count = ClassPeriod.objects.filter(teacher=teacher).count() if teacher else 0
        can_teach = bool(getattr(teacher, "can_teach", True)) and bool(getattr(profile, "is_teaching", True))
        full_name = teacher.full_name if teacher else (user.get_full_name() or user.username)
        photo_raw = teacher.photo if (teacher and teacher.photo) else (profile.avatar if profile else None)

        cached = {
            "id": user.id,
            "username": user.username,
            "first_name": teacher.first_name if teacher else user.first_name,
            "middle_name": teacher.middle_name if teacher else "",
            "last_name": teacher.last_name if teacher else user.last_name,
            "full_name": full_name,
            "faculty_name": full_name,
            "faculty_id": teacher.employee_id if teacher else user.username,
            "faculty_pk": teacher.id if teacher else None,
            "email": (teacher.email if teacher else "") or user.email,
            "contact_number": teacher.contact_number if teacher else (profile.phone_number if profile else ""),
            "position": teacher.position if teacher else "",
            "department": teacher.department if teacher else "",
            "_photo_path": photo_raw.name if (photo_raw and hasattr(photo_raw, "name")) else None,
            "role": role,
            "system_role": role,
            "is_profile_completed": bool(profile and profile.is_profile_completed),
            "can_teach": can_teach,
            "is_teaching": can_teach or class_count > 0,
            "assigned_class_count": class_count,
            "is_superuser": user.is_superuser,
        }
        cache.set(cache_key, cached, timeout=15)

    school_meta = get_school_metadata(request)
    photo_url = build_media_url(f"/media/{cached['_photo_path']}", request) if cached.get("_photo_path") else None

    return {
        k: v for k, v in cached.items() if k != "_photo_path"
    } | {
        "photo": photo_url,
        "photo_url": photo_url,
        "school_name": school_meta.get("school_name", ""),
        "school_id": school_meta.get("school_id", ""),
        "school_logo": school_meta.get("school_logo"),
        "left_logo": school_meta.get("left_logo"),
        "right_logo": school_meta.get("right_logo"),
    }


def login_with_credentials(*, request, username: str, password: str) -> dict:
    if not username or not password:
        raise AppError("MISSING_CREDENTIALS", "Username and password are required.", 400)

    existing_user = User.objects.filter(username__iexact=username).first()
    profile = getattr(existing_user, "profile", None) if existing_user else None

    if profile and profile.is_locked():
        raise AppError("ACCOUNT_LOCKED", "Account temporarily locked. Try again in 15 minutes.", 429)

    user = authenticate(request=request, username=username, password=password)
    if user is None:
        if profile:
            profile.record_failed_attempt()
        raise AppError("INVALID_CREDENTIALS", "Invalid username or password.", 401)

    if not user.is_active:
        raise AppError("ACCOUNT_INACTIVE", "Account is inactive. Contact your administrator.", 403)

    if profile:
        profile.reset_failed_attempts()

    legacy_token, _ = Token.objects.get_or_create(user=user)
    refresh = RefreshToken.for_user(user)
    return {
        "token": legacy_token.key,
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": build_user_session_payload(user, request),
    }


@transaction.atomic
def update_own_profile(*, user, data: dict, files: dict, request=None) -> dict:
    if "first_name" in data:
        user.first_name = str(data["first_name"]).strip()
    if "last_name" in data:
        user.last_name = str(data["last_name"]).strip()
    if "email" in data:
        clean_email = str(data["email"]).strip()
        if clean_email and User.objects.filter(email__iexact=clean_email).exclude(id=user.id).exists():
            raise AppError("EMAIL_TAKEN", "Email is already used by another account.", 400)
        user.email = clean_email

    if data.get("password"):
        pw = str(data["password"]).strip()
        try:
            validate_password(pw, user=user)
        except DjangoValidationError as exc:
            raise AppError("WEAK_PASSWORD", " ".join(exc.messages), 400)
        user.set_password(pw)

    user.save()

    raw_photo = files.get("photo") or files.get("avatar") or data.get("photo") or data.get("avatar")
    photo_file = decode_uploaded_image(raw_photo, prefix="avatar")
    if isinstance(photo_file, serializers.SkipField):
        photo_file = None

    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.is_profile_completed = bool(user.first_name and user.last_name)
    if data.get("contact_number"):
        profile.phone_number = str(data["contact_number"]).strip()
    if photo_file:
        profile.avatar = photo_file
    profile.save()

    teacher = resolve_teacher_for_user(user)
    if teacher:
        teacher.first_name = user.first_name or teacher.first_name
        teacher.last_name = user.last_name or teacher.last_name
        teacher.email = user.email or teacher.email
        if data.get("contact_number"):
            teacher.contact_number = str(data["contact_number"]).strip()
        if photo_file:
            photo_file.seek(0)
            teacher.photo = photo_file
        teacher.save()

    cache.delete(user_session_cache_key(user.id))
    return build_user_session_payload(user, request)


def reset_teacher_bound_device(*, teacher_id: int) -> TeacherProfile:
    teacher = TeacherProfile.objects.filter(id=teacher_id).first()
    if not teacher:
        raise AppError("TEACHER_NOT_FOUND", "Teacher profile not found.", 404)
    teacher.bound_device_id = None
    teacher.device_model = None
    teacher.device_bound_at = None
    teacher.save(update_fields=["bound_device_id", "device_model", "device_bound_at"])
    return teacher