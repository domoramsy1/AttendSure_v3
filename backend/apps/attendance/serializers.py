import uuid
from datetime import timedelta
from django.utils import timezone
from rest_framework import serializers
from common.permissions import is_school_leader
from apps.accounts.models import TeacherProfile
from apps.accounts.selectors import resolve_teacher_for_user
from apps.messaging.services import notify_student_parent
from .models import ExitPass


class ExitPassSerializer(serializers.ModelSerializer):
    bearer_type = serializers.SerializerMethodField()
    student_name = serializers.CharField(source="student.full_name", read_only=True, default="")
    student_lrn = serializers.CharField(source="student.lrn", read_only=True, default="")
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True, default="")
    faculty_name = serializers.CharField(source="teacher.full_name", read_only=True, default="")
    faculty_emp_id = serializers.CharField(source="teacher.employee_id", read_only=True, default="")
    adviser_name = serializers.CharField(source="issued_by.full_name", read_only=True, default="School Staff")
    valid_to = serializers.DateTimeField(source="valid_until", required=False)

    class Meta:
        model = ExitPass
        fields = [
            "id", "pass_number", "bearer_type",
            "student", "student_name", "student_lrn",
            "teacher", "teacher_name", "faculty_name", "faculty_emp_id",
            "issued_by", "adviser_name", "pass_type", "reason",
            "valid_from", "valid_until", "valid_to", "status", "created_at",
        ]
        read_only_fields = ["id", "pass_number", "issued_by", "status", "created_at"]
        extra_kwargs = {
            "valid_from": {"required": False},
            "valid_until": {"required": False},
        }

    def get_bearer_type(self, obj) -> str:
        return "STUDENT" if obj.student_id else "FACULTY"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("status") == "REVOKED":
            data["status"] = "DECLINED"
        return data

    def validate(self, attrs):
        now = timezone.now()
        attrs.setdefault("valid_from", now)
        attrs.setdefault("valid_until", attrs["valid_from"] + timedelta(hours=4))
        if attrs["valid_until"] <= attrs["valid_from"]:
            raise serializers.ValidationError({"valid_until": "Return time must be after departure time."})
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        issuer = resolve_teacher_for_user(request.user) or TeacherProfile.objects.filter(is_active=True).first()
        if not validated_data.get("student") and not validated_data.get("teacher"):
            validated_data["teacher"] = issuer

        is_student_pass = bool(validated_data.get("student"))
        initial_status = "ACTIVE" if (is_school_leader(request.user) or is_student_pass) else "PENDING"
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