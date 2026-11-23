# backend/apps/students/serializers.py
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.school.models import Section
from common.media import FlexibleImageField, build_media_url
from common.qr_signer import sign_student_qr
from .models import Enrollment, Student
from .services import sync_student_enrollment


class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    barangay = serializers.CharField(required=False, allow_blank=True, default="")
    municipality_city = serializers.CharField(required=False, allow_blank=True, default="")
    province = serializers.CharField(required=False, allow_blank=True, default="")
    photo = FlexibleImageField(required=False, allow_null=True)
    photo_url = serializers.SerializerMethodField()
    remove_photo = serializers.BooleanField(required=False, write_only=True, default=False)
    qr_payload = serializers.SerializerMethodField()
    section_id = serializers.IntegerField(required=False, allow_null=True, write_only=True)
    current_section = serializers.SerializerMethodField()
    current_section_id = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            "id",
            "lrn",
            "first_name",
            "middle_name",
            "last_name",
            "suffix",
            "full_name",
            "sex",
            "birthdate",
            "mother_tongue",
            "ethnic_group",
            "religion",
            "house_street_sitio",
            "barangay",
            "municipality_city",
            "province",
            "father_name",
            "mother_maiden_name",
            "guardian_name",
            "guardian_relationship",
            "parent_contact",
            "photo",
            "photo_url",
            "remove_photo",
            "qr_token",
            "qr_payload",
            "is_active",
            "current_section",
            "current_section_id",
            "section_id",
        ]
        read_only_fields = ["id", "qr_token"]

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        if "sex" in mutable and mutable["sex"] is not None:
            raw_sex = str(mutable["sex"]).strip().upper()
            if raw_sex in ("M", "MALE"):
                mutable["sex"] = "Male"
            elif raw_sex in ("F", "FEMALE"):
                mutable["sex"] = "Female"
        return super().to_internal_value(mutable)

    def validate_section_id(self, value):
        if value is not None and not Section.objects.filter(id=value).exists():
            raise serializers.ValidationError("Selected section does not exist.")
        return value

    def get_photo_url(self, obj):
        return build_media_url(obj.photo, self.context.get("request"))

    def get_qr_payload(self, obj) -> str:
        return sign_student_qr(obj.lrn, obj.qr_token)

    def _active_enrollment(self, obj):
        fallback = None
        for enr in obj.enrollments.all():
            if enr.section:
                if enr.section.school_year and enr.section.school_year.is_active:
                    return enr
                fallback = fallback or enr
        return fallback

    def get_current_section(self, obj) -> str:
        enr = self._active_enrollment(obj)
        return enr.section.name if enr and enr.section else "Unassigned"

    def get_current_section_id(self, obj) -> int | None:
        enr = self._active_enrollment(obj)
        return enr.section_id if enr else None

    @transaction.atomic
    def create(self, validated_data):
        section_id = validated_data.pop("section_id", None)
        validated_data.pop("remove_photo", None)
        barangay = validated_data.pop("barangay", "")
        city = validated_data.pop("municipality_city", "")
        province = validated_data.pop("province", "")

        student = Student(**validated_data)
        student.set_address_location(barangay=barangay, municipality_city=city, province=province)
        student.save()
        sync_student_enrollment(student=student, section_id=section_id)
        return student

    @transaction.atomic
    def update(self, instance, validated_data):
        section_id = validated_data.pop("section_id", None)
        remove_photo = bool(validated_data.pop("remove_photo", False))
        if remove_photo:
            validated_data["photo"] = None

        has_loc_change = any(k in validated_data for k in ("barangay", "municipality_city", "province"))
        barangay = validated_data.pop("barangay", instance.barangay)
        city = validated_data.pop("municipality_city", instance.municipality_city)
        province = validated_data.pop("province", instance.province)

        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        if has_loc_change:
            instance.set_address_location(barangay=barangay, municipality_city=city, province=province)
        instance.save()
        sync_student_enrollment(student=instance, section_id=section_id)
        return instance


class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    lrn = serializers.CharField(source="student.lrn", read_only=True)
    section_name = serializers.CharField(source="section.name", read_only=True)
    school_year = serializers.PrimaryKeyRelatedField(source="section.school_year", read_only=True)

    class Meta:
        model = Enrollment
        fields = [
            "id",
            "student",
            "student_name",
            "lrn",
            "section",
            "section_name",
            "school_year",
            "enrollment_date",
            "status",
            "status_date",
            "remarks",
        ]
        extra_kwargs = {
            "enrollment_date": {"required": False},
        }
        validators = []

    def validate(self, attrs):
        student = attrs.get("student") or (self.instance.student if self.instance else None)
        section = attrs.get("section") or (self.instance.section if self.instance else None)
        if student and section:
            dup = Enrollment.objects.filter(student=student, section__school_year=section.school_year)
            if self.instance:
                dup = dup.exclude(pk=self.instance.pk)
            if dup.exists():
                raise serializers.ValidationError(
                    {"student": "This student is already enrolled for the selected school year."}
                )

        if not self.instance and not attrs.get("enrollment_date"):
            attrs["enrollment_date"] = timezone.localdate()
        return attrs