# AttendSure Backend - Common Input Validators
# File: D:\AttendSure_V3\backend\common\validators.py

# backend/common/validators.py
import re
from django.contrib.auth import get_user_model
from django.utils.html import strip_tags
from rest_framework import serializers

from common.permissions import ALLOWED_ROLES
from common.phone import normalize_ph_phone

User = get_user_model()
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")


def clean_text(value: object, max_len: int = 150) -> str:
    cleaned = CONTROL_RE.sub(" ", strip_tags(str(value or "")))
    return " ".join(cleaned.split())[:max_len]


def validate_staff_role(value: str) -> str:
    clean = str(value or "TEACHER").strip().upper()
    if clean not in ALLOWED_ROLES:
        raise serializers.ValidationError(
            "Invalid role. Allowed roles are ADMIN, PRINCIPAL, DEPT_HEAD, and TEACHER."
        )
    return clean


def validate_unique_username(
    value: str,
    *,
    exclude_user_id: int | None = None,
    required: bool = False,
) -> str:
    clean = clean_text(value, 150)
    if required and not clean:
        raise serializers.ValidationError("Username is required.")
    if clean:
        qs = User.objects.filter(username__iexact=clean)
        if exclude_user_id:
            qs = qs.exclude(pk=exclude_user_id)
        if qs.exists():
            raise serializers.ValidationError("This username is already taken.")
    return clean


def validate_unique_user_email(value: str, exclude_user_id: int | None = None) -> str:
    clean = clean_text(value, 150).lower()
    if clean:
        qs = User.objects.filter(email__iexact=clean)
        if exclude_user_id:
            qs = qs.exclude(pk=exclude_user_id)
        if qs.exists():
            raise serializers.ValidationError("This email address is already in use.")
    return clean


def validate_unique_employee_id(
    value: str,
    *,
    exclude_teacher_id: int | None = None,
    required: bool = False,
) -> str:
    from apps.accounts.models import TeacherProfile

    clean = clean_text(value, 50)
    if required and not clean:
        raise serializers.ValidationError("Employee ID is required.")
    if clean:
        qs = TeacherProfile.objects.filter(employee_id__iexact=clean)
        if exclude_teacher_id:
            qs = qs.exclude(pk=exclude_teacher_id)
        if qs.exists():
            raise serializers.ValidationError("This Employee ID is already assigned.")
    return clean


def validate_unique_teacher_phone(value: str, exclude_teacher_id: int | None = None) -> str:
    from apps.accounts.models import TeacherProfile

    norm = normalize_ph_phone(value)
    if norm:
        qs = TeacherProfile.objects.filter(contact_number=norm)
        if exclude_teacher_id:
            qs = qs.exclude(pk=exclude_teacher_id)
        if qs.exists():
            raise serializers.ValidationError(
                "This mobile number is already assigned to another staff account."
            )
    return norm
