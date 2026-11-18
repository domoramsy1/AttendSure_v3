from rest_framework import serializers
from common.media import FlexibleImageField, build_media_url
from common.qr_signer import sign_student_qr
from apps.school.models import SchoolYear
from .models import Enrollment, Student
from .services import sync_student_enrollment


class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    photo = FlexibleImageField(required=False, allow_null=True)
    photo_url = serializers.SerializerMethodField()
    qr_payload = serializers.SerializerMethodField()
    section_id = serializers.IntegerField(required=False, allow_null=True, write_only=True)
    current_section = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            "id", "lrn", "first_name", "middle_name", "last_name", "suffix",
            "full_name", "sex", "birthdate", "mother_tongue", "ethnic_group",
            "religion", "house_street_sitio", "barangay", "municipality_city",
            "province", "father_name", "mother_maiden_name", "guardian_name",
            "guardian_relationship", "parent_contact", "photo", "photo_url",
            "qr_token", "qr_payload", "is_active", "current_section", "section_id",
        ]
        read_only_fields = ["id", "qr_token"]

    def get_photo_url(self, obj):
        return build_media_url(obj.photo, self.context.get("request"))

    def get_qr_payload(self, obj) -> str:
        return sign_student_qr(obj.lrn, obj.qr_token)

    def get_current_section(self, obj) -> str:
        for enr in obj.enrollments.all():
            if enr.school_year and enr.school_year.is_active and enr.section:
                return enr.section.name
        return "Unassigned"

    def create(self, validated_data):
        section_id = validated_data.pop("section_id", None)
        student = super().create(validated_data)
        sync_student_enrollment(student=student, section_id=section_id)
        return student

    def update(self, instance, validated_data):
        section_id = validated_data.pop("section_id", None)
        student = super().update(instance, validated_data)
        sync_student_enrollment(student=student, section_id=section_id)
        return student


class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    lrn = serializers.CharField(source="student.lrn", read_only=True)
    section_name = serializers.CharField(source="section.name", read_only=True)

    class Meta:
        model = Enrollment
        fields = [
            "id", "student", "student_name", "lrn", "section",
            "section_name", "school_year", "enrollment_date", "status", "remarks",
        ]
        extra_kwargs = {"school_year": {"required": False}}

    def create(self, validated_data):
        if not validated_data.get("school_year"):
            validated_data["school_year"] = SchoolYear.objects.filter(is_active=True).first() or SchoolYear.objects.first()
        return super().create(validated_data)