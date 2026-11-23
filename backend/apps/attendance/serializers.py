# D:\AttendSure_V3\backend\apps\attendance\serializers.py

import os
import uuid
from datetime import timedelta
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import FacultyProfile
from apps.accounts.selectors import get_faculty_student_ids, resolve_faculty_for_user
from apps.messaging.services import notify_student_parent
from common.exceptions import AppError
from common.media import build_media_url, decode_uploaded_image
from common.permissions import get_user_role, is_school_leader
from .models import ExitPass

ALLOWED_PROOF_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
MAX_PROOF_BYTES = 5 * 1024 * 1024


class ExitPassProofField(serializers.Field):
    """Accepts multipart file uploads (PDF/Image) or Base64 data URIs with strict size & extension validation."""

    def to_representation(self, value):
        return build_media_url(value, self.context.get("request"))

    def to_internal_value(self, data):
        if data in (None, "", "null", "undefined"):
            return None

        if hasattr(data, "read"):
            ext = os.path.splitext(str(getattr(data, "name", "") or ""))[1].lower()
            if ext not in ALLOWED_PROOF_EXTS:
                raise serializers.ValidationError("Allowed proof formats: PDF, JPG, PNG, or WEBP.")
            size = getattr(data, "size", 0) or 0
            if size > MAX_PROOF_BYTES:
                raise serializers.ValidationError("Proof attachment cannot exceed 5 MB.")
            if ext == ".pdf":
                header = data.read(5)
                data.seek(0)
                if header != b"%PDF-":
                    raise serializers.ValidationError("Uploaded PDF file is invalid or corrupted.")
                return data
            return decode_uploaded_image(data, prefix="exit_proof")

        if isinstance(data, str) and data.strip().startswith("data:image"):
            decoded = decode_uploaded_image(data, prefix="exit_proof")
            if not isinstance(decoded, serializers.SkipField):
                return decoded

        raise serializers.SkipField()


class ExitPassSerializer(serializers.ModelSerializer):
    bearer_type = serializers.SerializerMethodField()
    student_name = serializers.CharField(source="student.full_name", read_only=True, default="")
    student_lrn = serializers.CharField(source="student.lrn", read_only=True, default="")
    teacher = serializers.IntegerField(source="faculty_id", read_only=True, allow_null=True)
    teacher_name = serializers.CharField(source="faculty.full_name", read_only=True, default="")
    faculty_name = serializers.CharField(source="faculty.full_name", read_only=True, default="")
    faculty_emp_id = serializers.CharField(source="faculty.employee_id", read_only=True, default="")
    adviser_name = serializers.CharField(source="issued_by.full_name", read_only=True, default="School Staff")
    valid_to = serializers.DateTimeField(source="valid_until", required=False)
    attachment = ExitPassProofField(required=False, allow_null=True)
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = ExitPass
        fields = [
            "id",
            "pass_number",
            "bearer_type",
            "student",
            "student_name",
            "student_lrn",
            "teacher",
            "teacher_name",
            "faculty",
            "faculty_name",
            "faculty_emp_id",
            "issued_by",
            "adviser_name",
            "pass_type",
            "reason",
            "attachment",
            "attachment_url",
            "valid_from",
            "valid_until",
            "valid_to",
            "status",
            "created_at",
        ]
        read_only_fields = ["id", "pass_number", "issued_by", "status", "created_at"]
        extra_kwargs = {
            "valid_from": {"required": False},
            "valid_until": {"required": False},
        }

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        empty_vals = ("", "null", "none", "undefined")
        if "faculty" in mutable and str(mutable["faculty"]).strip().lower() in empty_vals:
            mutable["faculty"] = None
        if not mutable.get("faculty"):
            for alias in ("faculty_id", "teacher", "teacher_id"):
                if alias in mutable and str(mutable[alias]).strip().lower() not in empty_vals:
                    mutable["faculty"] = mutable[alias]
                    break
        if "student" in mutable and str(mutable["student"]).strip().lower() in empty_vals:
            mutable["student"] = None
        if not mutable.get("student") and "student_id" in mutable:
            if str(mutable["student_id"]).strip().lower() not in empty_vals:
                mutable["student"] = mutable["student_id"]
        if "attachment" not in mutable and "proof_file" in mutable:
            mutable["attachment"] = mutable["proof_file"]
        return super().to_internal_value(mutable)

    def get_bearer_type(self, obj) -> str:
        return "STUDENT" if obj.student_id else "FACULTY"

    def get_attachment_url(self, obj):
        return build_media_url(obj.attachment, self.context.get("request"))

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("status") == "REVOKED":
            data["status"] = "DECLINED"
        return data

    def validate(self, attrs):
        if self.instance:
            valid_from = attrs.get("valid_from", self.instance.valid_from)
            valid_until = attrs.get("valid_until", self.instance.valid_until)
            if valid_from and valid_until and valid_until <= valid_from:
                raise serializers.ValidationError({"valid_until": "Return time must be after departure time."})
            return attrs
        now = timezone.now()
        attrs.setdefault("valid_from", now)
        attrs.setdefault("valid_until", attrs["valid_from"] + timedelta(hours=4))
        if attrs["valid_until"] <= attrs["valid_from"]:
            raise serializers.ValidationError({"valid_until": "Return time must be after departure time."})
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        user = request.user
        role = get_user_role(user)
        leader = is_school_leader(user)

        if role == "PARENT":
            raise AppError("FORBIDDEN", "Parent accounts cannot issue exit passes.", 403)

        own_faculty = resolve_faculty_for_user(user)
        issuer = own_faculty or (FacultyProfile.objects.filter(is_active=True).first() if leader else None)
        if not issuer:
            raise AppError(
                "NO_FACULTY_PROFILE",
                "A linked faculty profile is required to issue an exit pass.",
                403,
            )

        target_student = validated_data.get("student")
        target_faculty = validated_data.get("faculty")

        if target_student:
            if not leader and target_student.id not in get_faculty_student_ids(own_faculty):
                raise AppError(
                    "FORBIDDEN",
                    "You can only issue exit passes for students in your assigned classes.",
                    403,
                )
            validated_data["faculty"] = None
        else:
            validated_data["student"] = None
            if not leader:
                validated_data["faculty"] = own_faculty
            elif not target_faculty:
                validated_data["faculty"] = issuer

        is_student_pass = bool(validated_data.get("student"))
        initial_status = "ACTIVE" if (leader or is_student_pass) else "PENDING"
        pass_code = f"EP-{timezone.localdate().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

        pass_obj = ExitPass.objects.create(
            **validated_data,
            pass_number=pass_code,
            issued_by=issuer,
            status=initial_status,
        )
        if pass_obj.student:
            notify_student_parent(
                student=pass_obj.student,
                title=f"Exit Pass Issued: {pass_obj.student.first_name}",
                message=f"Exit pass #{pass_code} issued for {pass_obj.student.full_name} ({pass_obj.reason}).",
                category="GATE_PASS",
            )
        return pass_obj

    def update(self, instance, validated_data):
        if validated_data.get("student") is not None:
            validated_data["faculty"] = None
        elif validated_data.get("faculty") is not None:
            validated_data["student"] = None
        return super().update(instance, validated_data)