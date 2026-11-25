import re
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.school.models import ClassPeriod, Section
from apps.school.selectors import format_section_label
from common.media import FlexibleImageField, build_media_url
from common.phone import normalize_ph_phone
from common.qr_signer import sign_student_qr
from common.validators import clean_text as _clean_text
from .models import Enrollment, Student
from .services import sync_student_enrollment


class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    sex = serializers.CharField(source="gender", required=False)
    birthdate = serializers.DateField(source="birth_date", required=False)
    barangay = serializers.CharField(required=False, allow_blank=True, default="")
    municipality_city = serializers.CharField(required=False, allow_blank=True, default="")
    province = serializers.CharField(required=False, allow_blank=True, default="")
    photo = FlexibleImageField(required=False, allow_null=True)
    photo_url = serializers.SerializerMethodField()
    remove_photo = serializers.BooleanField(required=False, write_only=True, default=False)
    qr_payload = serializers.SerializerMethodField()
    section_id = serializers.IntegerField(required=False, allow_null=True, write_only=True)
    enrollment_status = serializers.ChoiceField(
        choices=["ENROLLED", "TRANSFERRED_IN", "TRANSFERRED_OUT", "DROPPED"],
        required=False,
        write_only=True,
    )
    current_section = serializers.SerializerMethodField()
    current_section_id = serializers.SerializerMethodField()
    current_enrollment_id = serializers.SerializerMethodField()
    grade_level_name = serializers.SerializerMethodField()
    section_display_label = serializers.SerializerMethodField()
    scheduled_subjects_count = serializers.SerializerMethodField()

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
            "gender",
            "sex",
            "birth_date",
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
            "guardian_contact",
            "photo",
            "photo_url",
            "remove_photo",
            "qr_token",
            "qr_payload",
            "is_active",
            "current_section",
            "current_section_id",
            "current_enrollment_id",
            "grade_level_name",
            "section_display_label",
            "scheduled_subjects_count",
            "section_id",
            "enrollment_status",
        ]
        read_only_fields = ["id", "qr_token"]
        extra_kwargs = {
            "lrn": {"validators": []},
            "gender": {"required": False},
            "birth_date": {"required": False},
        }

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        raw_gender = mutable.get("gender") if "gender" in mutable else mutable.get("sex")
        if raw_gender is not None:
            g_upper = str(raw_gender).strip().upper()
            normalized_g = "Female" if g_upper in ("F", "FEMALE") else "Male"
            mutable["gender"] = normalized_g
            mutable.pop("sex", None)

        if "birth_date" not in mutable and "birthdate" in mutable:
            mutable["birth_date"] = mutable.pop("birthdate")
        else:
            mutable.pop("birthdate", None)

        if "enrollment_status" in mutable:
            raw_es = str(mutable["enrollment_status"] or "").strip().upper()
            if not raw_es or raw_es in ("NONE", "NULL", "UNASSIGNED"):
                mutable.pop("enrollment_status", None)
            else:
                mutable["enrollment_status"] = raw_es

        for field_name in (
            "first_name",
            "middle_name",
            "last_name",
            "suffix",
            "mother_tongue",
            "ethnic_group",
            "religion",
            "house_street_sitio",
            "father_name",
            "mother_maiden_name",
            "guardian_name",
            "guardian_relationship",
            "guardian_contact",
            "barangay",
            "municipality_city",
            "province",
        ):
            if field_name in mutable and isinstance(mutable[field_name], str):
                mutable[field_name] = _clean_text(mutable[field_name], 200)

        if "lrn" in mutable and mutable["lrn"] is not None:
            mutable["lrn"] = re.sub(r"\D+", "", str(mutable["lrn"]))[:12]

        return super().to_internal_value(mutable)

    def validate_lrn(self, value: str) -> str:
        digits = re.sub(r"\D+", "", str(value or ""))
        if len(digits) != 12:
            raise serializers.ValidationError("LRN must be exactly 12 digits.")
        qs = Student.objects.filter(lrn=digits)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This 12-digit LRN is already registered to another student.")
        return digits

    def validate_guardian_contact(self, value: str) -> str:
        # Siblings may share the same parent/guardian mobile number; normalize format only.
        return normalize_ph_phone(value)[:50] if value else ""

    def validate_section_id(self, value):
        if value is not None and not Section.objects.filter(id=value).exists():
            raise serializers.ValidationError("Selected section does not exist.")
        return value

    def validate(self, attrs):
        if not self.instance:
            if not attrs.get("gender"):
                attrs["gender"] = "Male"
            if not attrs.get("birth_date"):
                raise serializers.ValidationError({"birth_date": "Birth date is required."})
        return attrs

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
        return enr.section.name if (enr and enr.section) else "Unassigned"

    def get_current_section_id(self, obj) -> int | None:
        enr = self._active_enrollment(obj)
        return enr.section_id if enr else None

    def get_current_enrollment_id(self, obj) -> int | None:
        enr = self._active_enrollment(obj)
        return enr.id if enr else None

    def get_grade_level_name(self, obj) -> str:
        enr = self._active_enrollment(obj)
        return enr.section.grade_level.name if (enr and enr.section and enr.section.grade_level) else ""

    def get_section_display_label(self, obj) -> str:
        enr = self._active_enrollment(obj)
        if enr and enr.section:
            return format_section_label(
                enr.section.grade_level.name if enr.section.grade_level else "",
                enr.section.name,
            )
        return "Unassigned"

    def get_scheduled_subjects_count(self, obj) -> int:
        enr = self._active_enrollment(obj)
        if not enr or not enr.section_id:
            return 0
        annotated = getattr(enr, "active_periods_count", None)
        if annotated is not None:
            return int(annotated)
        return ClassPeriod.objects.filter(section_id=enr.section_id, is_active=True).count()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        enr = self._active_enrollment(instance)
        data["enrollment_status"] = enr.status if enr else "UNASSIGNED"
        return data

    @transaction.atomic
    def create(self, validated_data):
        section_id = validated_data.pop("section_id", None)
        enrollment_status = validated_data.pop("enrollment_status", None)
        validated_data.pop("remove_photo", None)
        barangay = validated_data.pop("barangay", "")
        city = validated_data.pop("municipality_city", "")
        province = validated_data.pop("province", "")

        student = Student(**validated_data)
        student.set_address_location(barangay=barangay, municipality_city=city, province=province)
        student.save()
        sync_student_enrollment(
            student=student,
            section_id=section_id,
            enrollment_status=enrollment_status,
        )
        return student

    @transaction.atomic
    def update(self, instance, validated_data):
        section_id = validated_data.pop("section_id", None)
        enrollment_status = validated_data.pop("enrollment_status", None)
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
        sync_student_enrollment(
            student=instance,
            section_id=section_id,
            enrollment_status=enrollment_status,
        )
        return instance


class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    lrn = serializers.CharField(source="student.lrn", read_only=True)
    section_name = serializers.CharField(source="section.name", read_only=True)
    grade_level_name = serializers.CharField(source="section.grade_level.name", read_only=True)
    school_year = serializers.PrimaryKeyRelatedField(source="section.school_year", read_only=True)
    school_year_name = serializers.CharField(source="section.school_year.name", read_only=True)
    enrollment_date = serializers.DateField(source="enrolled_date", required=False)

    class Meta:
        model = Enrollment
        fields = [
            "id",
            "student",
            "student_name",
            "lrn",
            "section",
            "section_name",
            "grade_level_name",
            "school_year",
            "school_year_name",
            "enrolled_date",
            "enrollment_date",
            "status",
            "status_date",
            "remarks",
        ]
        extra_kwargs = {"enrolled_date": {"required": False}}
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

        if not self.instance and not attrs.get("enrolled_date"):
            attrs["enrolled_date"] = timezone.localdate()
        return attrs
