# AttendSure Backend - Attendance Data Serializers
# File: D:\AttendSure_V3\backend\apps\attendance\serializers.py

# D:\AttendSure_V3\backend\apps\attendance\serializers.py
import base64
import os
import uuid
from datetime import timedelta
from django.core.files.base import ContentFile
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import TeacherProfile
from apps.accounts.selectors import (
    get_teacher_enrollment_ids,
    resolve_teacher_for_user,
)
from apps.students.models import ACTIVE_ENROLLMENT_STATUSES, Enrollment
from common.exceptions import AppError
from common.media import build_media_url, decode_uploaded_image
from common.permissions import is_school_leader
from common.validators import clean_text
from .models import ExitPass

ALLOWED_PROOF_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
MAX_PROOF_BYTES = 2 * 1024 * 1024


def _validate_pdf_bytes(raw_bytes: bytes) -> None:
    if not raw_bytes or len(raw_bytes) > MAX_PROOF_BYTES:
        raise serializers.ValidationError("Proof file must be 2 MB or smaller.")
    if not raw_bytes.startswith(b"%PDF-"):
        raise serializers.ValidationError("Uploaded PDF file is invalid or damaged.")
    lowered = raw_bytes[:8192].lower()
    if b"/javascript" in lowered or b"/js" in lowered:
        raise serializers.ValidationError("PDF files with active scripts are blocked.")


class ExitPassProofField(serializers.Field):
    """Validates PDF or image proof files up to 2 MB and blocks unsafe file content."""

    def to_representation(self, value):
        return build_media_url(value, self.context.get("request"))

    def to_internal_value(self, data):
        if data in (None, "", "null", "undefined"):
            return None

        if hasattr(data, "read"):
            safe_name = os.path.basename(str(getattr(data, "name", "") or ""))
            ext = os.path.splitext(safe_name)[1].lower()
            content_type = str(getattr(data, "content_type", "") or "").lower()
            if not ext and content_type == "application/pdf":
                ext = ".pdf"
                safe_name = f"exit_proof_{uuid.uuid4().hex}.pdf"
            if ext not in ALLOWED_PROOF_EXTS:
                raise serializers.ValidationError(
                    "Only PDF, JPG, PNG, or WEBP proof files are allowed."
                )
            size = getattr(data, "size", 0) or 0
            if size <= 0 or size > MAX_PROOF_BYTES:
                raise serializers.ValidationError("Proof file must be 2 MB or smaller.")
            if ext == ".pdf":
                raw_bytes = data.read()
                data.seek(0)
                _validate_pdf_bytes(raw_bytes)
                data.name = f"exit_proof_{uuid.uuid4().hex}.pdf"
                return data
            return decode_uploaded_image(data, prefix="exit_proof")

        if isinstance(data, str):
            clean = data.strip()
            if clean.startswith("data:image"):
                decoded = decode_uploaded_image(clean, prefix="exit_proof")
                if not isinstance(decoded, serializers.SkipField):
                    return decoded
            if clean.startswith("data:application/pdf") and ";base64," in clean:
                _, b64_part = clean.split(";base64,", 1)
                try:
                    raw_bytes = base64.b64decode(b64_part, validate=True)
                except Exception as exc:
                    raise serializers.ValidationError("Uploaded PDF file is invalid or damaged.") from exc
                _validate_pdf_bytes(raw_bytes)
                return ContentFile(raw_bytes, name=f"exit_proof_{uuid.uuid4().hex}.pdf")

        raise serializers.SkipField()


class ExitPassSerializer(serializers.ModelSerializer):
    pass_status = serializers.CharField(read_only=True)
    status = serializers.CharField(source="pass_status", read_only=True)
    bearer_type = serializers.CharField(source="pass_scope", read_only=True)
    person_name = serializers.SerializerMethodField()
    student = serializers.IntegerField(source="enrollment.student_id", read_only=True, allow_null=True)
    student_id = serializers.IntegerField(required=False, allow_null=True, write_only=True)
    student_name = serializers.SerializerMethodField()
    student_lrn = serializers.SerializerMethodField()
    section_name = serializers.SerializerMethodField()
    teacher_name = serializers.SerializerMethodField()
    teacher_employee_id = serializers.SerializerMethodField()
    issued_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    valid_from = serializers.DateTimeField(source="issued_at", required=False)
    valid_to = serializers.DateTimeField(source="valid_until", required=False)
    attachment = ExitPassProofField(required=False, allow_null=True)
    attachment_url = serializers.SerializerMethodField()
    clear_proof = serializers.BooleanField(required=False, write_only=True, default=False)

    class Meta:
        model = ExitPass
        fields = [
            "id",
            "pass_number",
            "pass_scope",
            "bearer_type",
            "person_name",
            "enrollment",
            "student",
            "student_id",
            "student_name",
            "student_lrn",
            "section_name",
            "teacher",
            "teacher_name",
            "teacher_employee_id",
            "pass_type",
            "reason",
            "destination",
            "attachment",
            "attachment_url",
            "clear_proof",
            "issued_by",
            "issued_by_name",
            "issued_at",
            "valid_from",
            "valid_until",
            "valid_to",
            "returned_at",
            "is_cancelled",
            "is_approved",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "pass_status",
            "status",
        ]
        read_only_fields = [
            "id",
            "pass_number",
            "issued_by",
            "returned_at",
            "is_cancelled",
            "is_approved",
            "approved_by",
            "approved_at",
        ]
        extra_kwargs = {
            "pass_scope": {"required": False},
            "issued_at": {"required": False},
            "valid_until": {"required": False},
        }

    def get_person_name(self, obj: ExitPass) -> str:
        if obj.pass_scope == "STUDENT" and obj.enrollment_id and obj.enrollment:
            return obj.enrollment.student.full_name
        if obj.teacher_id and obj.teacher:
            return obj.teacher.full_name
        if obj.enrollment_id and obj.enrollment:
            return obj.enrollment.student.full_name
        return ""

    def get_student_name(self, obj: ExitPass) -> str:
        return obj.enrollment.student.full_name if (obj.enrollment_id and obj.enrollment) else ""

    def get_student_lrn(self, obj: ExitPass) -> str:
        return obj.enrollment.student.lrn if (obj.enrollment_id and obj.enrollment) else ""

    def get_section_name(self, obj: ExitPass) -> str:
        if obj.enrollment_id and obj.enrollment and obj.enrollment.section:
            return obj.enrollment.section.name
        return ""

    def get_teacher_name(self, obj: ExitPass) -> str:
        return obj.teacher.full_name if (obj.teacher_id and obj.teacher) else ""

    def get_teacher_employee_id(self, obj: ExitPass) -> str:
        return obj.teacher.employee_id if (obj.teacher_id and obj.teacher) else ""

    def get_issued_by_name(self, obj: ExitPass) -> str:
        if not obj.issued_by:
            return "School Staff"
        return (obj.issued_by.get_full_name() or obj.issued_by.username).strip()

    def get_approved_by_name(self, obj: ExitPass) -> str:
        if not obj.approved_by:
            return ""
        return (obj.approved_by.get_full_name() or obj.approved_by.username).strip()

    def get_attachment_url(self, obj: ExitPass):
        return build_media_url(obj.attachment, self.context.get("request"))

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        empty_vals = ("", "null", "none", "undefined")

        if "teacher" in mutable and str(mutable["teacher"]).strip().lower() in empty_vals:
            mutable["teacher"] = None
        if not mutable.get("teacher") and "teacher_id" in mutable:
            if str(mutable["teacher_id"]).strip().lower() not in empty_vals:
                mutable["teacher"] = mutable["teacher_id"]

        if "enrollment" in mutable and str(mutable["enrollment"]).strip().lower() in empty_vals:
            mutable["enrollment"] = None
        if "student_id" not in mutable and "student" in mutable:
            if str(mutable["student"]).strip().lower() not in empty_vals:
                mutable["student_id"] = mutable["student"]
        if "student_id" in mutable and str(mutable["student_id"]).strip().lower() in empty_vals:
            mutable["student_id"] = None

        if "pass_scope" not in mutable and "bearer_type" in mutable:
            raw_scope = str(mutable["bearer_type"]).strip().upper()
            if raw_scope in ("STUDENT", "TEACHER"):
                mutable["pass_scope"] = raw_scope

        if "attachment" not in mutable and "proof_file" in mutable:
            mutable["attachment"] = mutable["proof_file"]

        if "clear_proof" not in mutable:
            for alias in ("remove_attachment", "clear_attachment", "remove_proof"):
                if alias in mutable:
                    mutable["clear_proof"] = mutable[alias]
                    break

        for txt_key in ("reason", "destination", "pass_type"):
            if txt_key in mutable and isinstance(mutable[txt_key], str):
                mutable[txt_key] = clean_text(mutable[txt_key], 300)

        return super().to_internal_value(mutable)

    def validate(self, attrs):
        issued_at = attrs.get("issued_at", self.instance.issued_at if self.instance else timezone.now())
        valid_until = attrs.get(
            "valid_until",
            self.instance.valid_until if self.instance else (issued_at + timedelta(hours=4)),
        )
        if valid_until <= issued_at:
            raise serializers.ValidationError({"valid_until": "Return time must be after exit time."})
        if not self.instance:
            attrs["issued_at"] = issued_at
            attrs["valid_until"] = valid_until
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        user = request.user
        leader = is_school_leader(user)
        own_teacher = resolve_teacher_for_user(user)
        now = timezone.now()

        student_id = validated_data.pop("student_id", None)
        validated_data.pop("clear_proof", None)
        enrollment = validated_data.get("enrollment")
        target_teacher = validated_data.get("teacher")

        if not enrollment and student_id:
            enrollment = (
                Enrollment.objects.select_related("student", "section")
                .filter(student_id=student_id, status__in=ACTIVE_ENROLLMENT_STATUSES)
                .order_by("-section__school_year__is_active", "-id")
                .first()
            )
            if not enrollment:
                raise serializers.ValidationError(
                    {"student_id": "Selected student is not enrolled in an active class."}
                )

        if enrollment:
            if not leader and (
                not own_teacher
                or not own_teacher.can_handle_classes
                or enrollment.id not in get_teacher_enrollment_ids(own_teacher)
            ):
                raise AppError(
                    "FORBIDDEN",
                    "You can only issue student exit passes for students in your assigned classes.",
                    403,
                )
            validated_data["pass_scope"] = "STUDENT"
            validated_data["enrollment"] = enrollment
            validated_data["teacher"] = None
            validated_data["is_approved"] = True
            validated_data["approved_by"] = user
            validated_data["approved_at"] = now
        else:
            validated_data["pass_scope"] = "TEACHER"
            validated_data["enrollment"] = None
            if not leader:
                if not own_teacher:
                    raise AppError("NO_TEACHER_PROFILE", "A teacher profile is required.", 403)
                validated_data["teacher"] = own_teacher
                validated_data["is_approved"] = False
                validated_data["approved_by"] = None
                validated_data["approved_at"] = None
            else:
                validated_data["teacher"] = (
                    target_teacher
                    or own_teacher
                    or TeacherProfile.objects.select_related("user")
                    .filter(user__is_active=True)
                    .first()
                )
                if not validated_data["teacher"]:
                    raise serializers.ValidationError({"teacher": "Select an active teacher for this pass."})
                validated_data["is_approved"] = True
                validated_data["approved_by"] = user
                validated_data["approved_at"] = now

        return ExitPass.objects.create(**validated_data, issued_by=user)

    def update(self, instance, validated_data):
        validated_data.pop("student_id", None)
        clear_proof = bool(validated_data.pop("clear_proof", False))
        if clear_proof and not validated_data.get("attachment"):
            validated_data["attachment"] = None
        if validated_data.get("enrollment") is not None:
            validated_data["pass_scope"] = "STUDENT"
            validated_data["teacher"] = None
        elif validated_data.get("teacher") is not None:
            validated_data["pass_scope"] = "TEACHER"
            validated_data["enrollment"] = None
        return super().update(instance, validated_data)
