# D:\AttendSure_V3\backend\apps\accounts\services.py

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from rest_framework import serializers
from rest_framework.authtoken.models import Token
from rest_framework_simplejwt.tokens import RefreshToken

from apps.school.models import ClassPeriod
from apps.school.selectors import get_school_metadata
from common.exceptions import AppError
from common.media import build_media_url, decode_uploaded_image
from common.permissions import get_user_role
from common.phone import normalize_ph_phone
from .models import SUFFIX_CHOICES, TeacherProfile, UserProfile
from .selectors import resolve_teacher_for_user

User = get_user_model()

TEACHER_DROPDOWN_CACHE_KEYS = ["teachers:dropdown:active", "teachers:dropdown:all"]
VALID_SUFFIXES = {code for code, _ in SUFFIX_CHOICES}


def user_session_cache_key(user_id: int) -> str:
    return f"accounts:me:{user_id}"


def invalidate_user_and_teacher_caches(user_id: int | None = None, teacher_id: int | None = None) -> None:
    keys = list(TEACHER_DROPDOWN_CACHE_KEYS)
    if user_id:
        keys.append(user_session_cache_key(user_id))
        keys.append(f"accounts:teacher_for_user:{user_id}")
    if teacher_id:
        keys.append(f"accounts:teacher_sections:{teacher_id}")
    cache.delete_many(keys)


def build_user_session_payload(user, request=None) -> dict:
    cache_key = user_session_cache_key(user.id)
    cached = cache.get(cache_key)
    if cached is None:
        teacher = resolve_teacher_for_user(user)
        profile = getattr(user, "profile", None)
        role = get_user_role(user)
        class_count = ClassPeriod.objects.filter(teacher=teacher, is_active=True).count() if teacher else 0
        can_teach = (
            False
            if role == "PARENT"
            else (bool(getattr(teacher, "can_teach", True)) and bool(getattr(profile, "is_teaching", True)))
        )
        full_name = teacher.full_name if teacher else (user.get_full_name() or user.username)
        photo_raw = teacher.photo if (teacher and teacher.photo) else (profile.avatar if profile else None)
        bound_id = getattr(teacher, "bound_device_id", None) if teacher else None

        cached = {
            "id": user.id,
            "username": user.username,
            "first_name": teacher.first_name if teacher else user.first_name,
            "middle_name": teacher.middle_name if teacher else "",
            "last_name": teacher.last_name if teacher else user.last_name,
            "suffix": getattr(teacher, "suffix", "") if teacher else "",
            "full_name": full_name,
            "faculty_name": full_name,
            "faculty_id": teacher.employee_id if teacher else user.username,
            "employee_id": teacher.employee_id if teacher else user.username,
            "faculty_pk": teacher.id if teacher else None,
            "email": (teacher.email if teacher else "") or user.email,
            "contact_number": teacher.contact_number if teacher else (profile.phone_number if profile else ""),
            "phone_number": profile.phone_number if profile else (teacher.contact_number if teacher else ""),
            "position": teacher.position if teacher else "",
            "department": teacher.department if teacher else "",
            "bound_device_id": bound_id,
            "device_model": getattr(teacher, "device_model", None) if teacher else None,
            "is_device_bound": bool(bound_id),
            "_photo_path": photo_raw.name if (photo_raw and hasattr(photo_raw, "name")) else None,
            "role": role,
            "system_role": role,
            "is_profile_completed": bool(profile and profile.is_profile_completed),
            "can_teach": can_teach,
            "is_teaching": False if role == "PARENT" else (can_teach or class_count > 0),
            "assigned_class_count": class_count,
            "is_superuser": user.is_superuser,
        }
        cache.set(cache_key, cached, timeout=30)

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
    clean_identifier = str(username or "").strip()[:100]
    raw_password = str(password or "")
    if not clean_identifier or not raw_password:
        raise AppError("MISSING_CREDENTIALS", "Enter both your username and password.", 400)

    existing_user = (
        User.objects.select_related("profile", "profile__teacher")
        .filter(
            Q(username__iexact=clean_identifier)
            | Q(profile__teacher__employee_id__iexact=clean_identifier)
        )
        .first()
    )
    profile = getattr(existing_user, "profile", None) if existing_user else None

    if profile and profile.is_locked():
        raise AppError(
            "ACCOUNT_LOCKED",
            "Too many failed sign-in attempts. Wait 15 minutes or ask your School Admin to unlock your account.",
            429,
        )

    if existing_user is None:
        User().set_password(raw_password)
        raise AppError("INVALID_CREDENTIALS", "Wrong username or password. Please try again.", 401)

    if not existing_user.is_active:
        User().set_password(raw_password)
        raise AppError("ACCOUNT_INACTIVE", "This account is inactive. Contact your School Admin.", 403)

    auth_user = authenticate(request=request, username=existing_user.username, password=raw_password)
    if auth_user is None:
        if profile:
            profile.record_failed_attempt()
        raise AppError("INVALID_CREDENTIALS", "Wrong username or password. Please try again.", 401)

    if profile:
        profile.reset_failed_attempts()

    return issue_session_for_user(auth_user, request)


def issue_session_for_user(auth_user, request=None) -> dict:
    legacy_token, _ = Token.objects.get_or_create(user=auth_user)
    refresh = RefreshToken.for_user(auth_user)
    return {
        "token": legacy_token.key,
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": build_user_session_payload(auth_user, request),
    }


DEMO_ROLE_MAP = {
    "ADMIN": ("demo_admin", ["ADMIN"]),
    "PRINCIPAL": ("demo_principal", ["PRINCIPAL"]),
    "DEPT_HEAD": ("demo_dept_head", ["DEPT_HEAD"]),
    "TEACHER": ("demo_teacher", ["FACULTY"]),
    "FACULTY": ("demo_teacher", ["FACULTY"]),
    "PARENT": ("demo_parent", ["PARENT"]),
}


def login_with_demo_role(*, request, role: str) -> dict:
    """Signs in a pre-seeded competition demo account by role (only called when Judge Demo Mode is enabled)."""
    key = str(role or "ADMIN").strip().upper()
    if key not in DEMO_ROLE_MAP:
        raise AppError(
            "INVALID_DEMO_ROLE",
            "Supported demo roles are: admin, principal, teacher, parent.",
            400,
        )

    preferred_username, profile_roles = DEMO_ROLE_MAP[key]
    user = (
        User.objects.select_related("profile", "profile__teacher")
        .filter(username__iexact=preferred_username, is_active=True)
        .first()
    )
    if user is None:
        user = (
            User.objects.select_related("profile", "profile__teacher")
            .filter(is_active=True, profile__role__in=profile_roles)
            .order_by("id")
            .first()
        )
    if user is None and key == "ADMIN":
        user = User.objects.filter(is_active=True, is_superuser=True).order_by("id").first()

    if user is None:
        raise AppError(
            "DEMO_NOT_SEEDED",
            "Competition demo accounts are not seeded yet. Run: python manage.py seed_competition_demo",
            404,
        )

    return issue_session_for_user(user, request)


@transaction.atomic
def update_own_profile(*, user, data: dict, files=None, request=None) -> dict:
    files = files or {}
    role = get_user_role(user)

    if "first_name" in data:
        user.first_name = str(data.get("first_name") or "").strip()[:150]
    if "last_name" in data:
        user.last_name = str(data.get("last_name") or "").strip()[:150]
    if "email" in data:
        clean_email = str(data.get("email") or "").strip().lower()[:150]
        if clean_email and User.objects.filter(email__iexact=clean_email).exclude(id=user.id).exists():
            raise AppError("EMAIL_TAKEN", "This email address is already used by another account.", 400)
        user.email = clean_email

    raw_password = str(data.get("password") or data.get("new_password") or "").strip()
    if raw_password:
        current_pw = str(data.get("current_password") or data.get("old_password") or "").strip()
        if user.has_usable_password() and current_pw and not user.check_password(current_pw):
            raise AppError("WRONG_CURRENT_PASSWORD", "Your current password is incorrect.", 400)
        try:
            validate_password(raw_password, user=user)
        except DjangoValidationError as exc:
            raise AppError("WEAK_PASSWORD", " ".join(exc.messages), 400)
        user.set_password(raw_password)

    user.save()

    if raw_password:
        Token.objects.filter(user=user).delete()

    raw_contact = str(data.get("contact_number") or data.get("phone_number") or "").strip()
    contact = normalize_ph_phone(raw_contact)[:30] if raw_contact else ""

    has_photo_key = any(k in data or k in files for k in ("photo", "avatar"))
    raw_photo = files.get("photo") or files.get("avatar") or data.get("photo") or data.get("avatar")

    clear_photo = has_photo_key and (raw_photo is None or str(raw_photo).strip().lower() in ("", "null", "none"))
    photo_file = None
    if has_photo_key and not clear_photo:
        decoded = decode_uploaded_image(raw_photo, prefix="avatar")
        if not isinstance(decoded, serializers.SkipField):
            photo_file = decoded

    profile, _ = UserProfile.objects.get_or_create(user=user)
    if contact and role != "PARENT":
        profile.phone_number = contact
    if clear_photo:
        profile.avatar = None
    elif photo_file:
        profile.avatar = photo_file
    profile.is_profile_completed = bool(user.first_name and user.last_name)
    profile.save()

    teacher = resolve_teacher_for_user(user)
    teacher_id = None
    if teacher:
        teacher_id = teacher.id
        if "first_name" in data and user.first_name:
            teacher.first_name = user.first_name[:100]
        if "middle_name" in data:
            teacher.middle_name = str(data.get("middle_name") or "").strip()[:100]
        if "last_name" in data and user.last_name:
            teacher.last_name = user.last_name[:100]
        if "suffix" in data:
            clean_suf = str(data.get("suffix") or "").strip()
            if clean_suf in VALID_SUFFIXES:
                teacher.suffix = clean_suf
        if contact:
            teacher.contact_number = contact[:50]
        if "email" in data:
            teacher.email = (user.email or "")[:150]
        if "department" in data and str(data.get("department") or "").strip():
            teacher.department = str(data.get("department")).strip()[:100]
        if "position" in data and str(data.get("position") or "").strip():
            teacher.position = str(data.get("position")).strip()[:100]
        if clear_photo:
            teacher.photo = None
        elif photo_file:
            photo_file.seek(0)
            teacher.photo = photo_file
        teacher.save()

    invalidate_user_and_teacher_caches(user_id=user.id, teacher_id=teacher_id)
    payload = build_user_session_payload(user, request)
    if raw_password:
        new_token, _ = Token.objects.get_or_create(user=user)
        payload["token"] = new_token.key
    return payload


@transaction.atomic
def reset_teacher_bound_device(*, teacher_id: int) -> TeacherProfile:
    teacher = TeacherProfile.objects.select_related("account").filter(id=teacher_id).first()
    if not teacher:
        raise AppError("TEACHER_NOT_FOUND", "Teacher profile not found.", 404)

    teacher.bound_device_id = None
    teacher.device_model = None
    teacher.device_bound_at = None
    teacher.save(update_fields=["bound_device_id", "device_model", "device_bound_at"])

    linked_account = getattr(teacher, "account", None)
    user_id = linked_account.user_id if linked_account else None

    invalidate_user_and_teacher_caches(user_id=user_id, teacher_id=teacher.id)
    return teacher


@transaction.atomic
def unlock_all_locked_accounts() -> int:
    """Clears failed login counters and temporary lockouts across all UserProfiles."""
    return UserProfile.objects.filter(Q(failed_attempts__gt=0) | Q(locked_until__isnull=False)).update(
        failed_attempts=0,
        locked_until=None,
    )