from django.contrib.auth import authenticate, get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.html import strip_tags
from rest_framework_simplejwt.tokens import RefreshToken

from common.exceptions import AppError
from common.phone import normalize_ph_phone
from .models import SUFFIX_CHOICES, FacultyProfile, UserProfile
from .selectors import resolve_faculty_for_user

User = get_user_model()
VALID_SUFFIXES = {choice[0] for choice in SUFFIX_CHOICES}


def _clean_input(value: object, max_length: int = 120) -> str:
    return strip_tags(str(value or "")).strip()[:max_length]


def build_user_session_payload(*, user, request=None) -> dict:
    """Builds the unified authenticated session payload in minimal queries."""
    profile = getattr(user, "profile", None) or (
        UserProfile.objects.select_related(
            "faculty",
            "faculty__department_ref",
            "faculty__position_ref",
        )
        .filter(user=user)
        .first()
    )
    faculty = resolve_faculty_for_user(user)
    role = profile.role if profile else ("ADMIN" if user.is_superuser else "FACULTY")
    can_handle_classes = (
        False
        if role == "PARENT"
        else (bool(faculty.can_handle_classes) if faculty else True)
    )

    photo_field = (
        faculty.photo
        if (faculty and faculty.photo)
        else (profile.avatar if (profile and profile.avatar) else None)
    )
    photo_url = None
    if photo_field:
        photo_url = request.build_absolute_uri(photo_field.url) if request else photo_field.url

    return {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name or (faculty.first_name if faculty else ""),
        "middle_name": faculty.middle_name if faculty else "",
        "last_name": user.last_name or (faculty.last_name if faculty else ""),
        "suffix": faculty.suffix if faculty else "",
        "full_name": (
            faculty.full_name
            if faculty
            else (user.get_full_name() or user.username).strip()
        ),
        "email": user.email or (faculty.email if faculty else ""),
        "role": role,
        "faculty_id": faculty.id if faculty else None,
        "employee_id": faculty.employee_id if faculty else "",
        "department": faculty.department if faculty else "",
        "position": faculty.position if faculty else "",
        "contact_number": (
            faculty.contact_number
            if (faculty and faculty.contact_number)
            else (profile.phone_number if profile else "")
        ),
        "phone_number": (
            profile.phone_number
            if (profile and profile.phone_number)
            else (faculty.contact_number if faculty else "")
        ),
        "photo_url": photo_url,
        "can_handle_classes": can_handle_classes,
        "has_bound_device": bool(faculty and faculty.bound_device_id),
        "device_model": faculty.device_model if faculty else None,
        "is_profile_completed": bool(profile and profile.is_profile_completed),
    }


def authenticate_with_identifier(*, identifier: str, password: str, request=None) -> dict:
    clean_identifier = _clean_input(identifier, 150)
    if not clean_identifier or not password:
        raise AppError("MISSING_CREDENTIALS", "Username/Employee ID and password are required.", 400)

    normalized_phone = normalize_ph_phone(clean_identifier)
    lookup = (
        Q(username__iexact=clean_identifier)
        | Q(email__iexact=clean_identifier)
        | Q(profile__faculty__employee_id__iexact=clean_identifier)
    )
    if normalized_phone:
        lookup = lookup | Q(profile__phone_number=normalized_phone)

    existing_user = (
        User.objects.select_related(
            "profile",
            "profile__faculty",
            "profile__faculty__department_ref",
            "profile__faculty__position_ref",
        )
        .filter(lookup)
        .first()
    )

    profile = getattr(existing_user, "profile", None) if existing_user else None
    if profile and profile.is_locked():
        raise AppError(
            "ACCOUNT_LOCKED",
            "Too many failed sign-in attempts. Please wait 15 minutes or ask an administrator to unlock your account.",
            423,
        )

    target_username = existing_user.username if existing_user else clean_identifier
    authenticated_user = authenticate(request=request, username=target_username, password=password)

    if not authenticated_user:
        if profile:
            profile.record_failed_attempt()
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
    first_name = _clean_input(data.get("first_name", user.first_name), 100)
    middle_name = _clean_input(data.get("middle_name", ""), 100)
    last_name = _clean_input(data.get("last_name", user.last_name), 100)
    suffix = _clean_input(data.get("suffix", ""), 20)
    if suffix not in VALID_SUFFIXES:
        suffix = ""

    email = _clean_input(data.get("email", user.email), 150)
    raw_phone = data.get("phone_number") or data.get("contact_number")
    contact = normalize_ph_phone(raw_phone) if raw_phone is not None else None

    if email and User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
        raise AppError("EMAIL_TAKEN", "This email address is already in use.", 400)

    user.first_name = first_name
    user.last_name = last_name
    user.email = email
    user.save(update_fields=["first_name", "last_name", "email"])

    photo_file = files.get("photo") or files.get("avatar") if files else None
    clear_photo = str(data.get("remove_photo", "")).lower() in ("1", "true", "yes")

    profile, _ = UserProfile.objects.get_or_create(user=user)
    if contact is not None:
        profile.phone_number = contact
    if clear_photo:
        profile.avatar = None
    elif photo_file:
        profile.avatar = photo_file
    profile.is_profile_completed = bool(user.first_name and user.last_name)
    profile.save()

    faculty = resolve_faculty_for_user(user)
    if faculty:
        faculty.first_name = first_name or faculty.first_name
        faculty.middle_name = middle_name
        faculty.last_name = last_name or faculty.last_name
        faculty.suffix = suffix
        faculty.email = email
        if contact is not None:
            faculty.contact_number = contact
        if "department" in data:
            faculty.department = _clean_input(data.get("department"), 100)
        if "position" in data:
            faculty.position = _clean_input(data.get("position"), 100)
        if clear_photo:
            faculty.photo = None
            faculty.photo_updated_at = timezone.now()
        elif photo_file:
            faculty.photo = photo_file
            faculty.photo_updated_at = timezone.now()
        faculty.save()

    return build_user_session_payload(user=user, request=request)


@transaction.atomic
def reset_faculty_bound_device(*, faculty_id: int) -> FacultyProfile:
    faculty = FacultyProfile.objects.select_related("account").filter(id=faculty_id).first()
    if not faculty:
        raise AppError("FACULTY_NOT_FOUND", "Faculty profile not found.", 404)
    faculty.bound_device_id = None
    faculty.device_model = None
    faculty.device_bound_at = None
    faculty.save(update_fields=["bound_device_id", "device_model", "device_bound_at", "updated_at"])
    return faculty


@transaction.atomic
def unlock_all_locked_accounts() -> int:
    """Clears failed sign-in counters and temporary lockouts across all UserProfiles."""
    return UserProfile.objects.filter(
        Q(failed_attempts__gt=0) | Q(locked_until__isnull=False)
    ).update(failed_attempts=0, locked_until=None)