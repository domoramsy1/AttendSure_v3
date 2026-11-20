# D:\AttendSure_V3\backend\apps\school\serializers.py

from decimal import Decimal, InvalidOperation
import math
from rest_framework import serializers

from common.media import SchoolLogoField, build_media_url
from .models import (
    ClassPeriod,
    GradeLevel,
    Room,
    SchoolHoliday,
    SchoolSettings,
    SchoolYear,
    Section,
    Subject,
)
from .selectors import format_section_label
from .services import sync_period_days, sync_uniform_subjects_for_section


class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ["id", "name", "building", "capacity", "room_type", "is_active"]


class GradeLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradeLevel
        fields = ["id", "code", "name", "stage", "level_order"]


class SchoolYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolYear
        fields = ["id", "code", "start_date", "baseline_cutoff_date", "end_date", "is_active"]


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ["id", "code", "title", "grade_level", "tier", "subject_type", "units"]


class SchoolHolidaySerializer(serializers.ModelSerializer):
    date = serializers.DateField(source="holiday_date")
    reason = serializers.CharField(source="title", required=False, write_only=True)
    type = serializers.CharField(required=False, write_only=True, default="HOLIDAY")

    class Meta:
        model = SchoolHoliday
        fields = ["id", "date", "title", "reason", "type", "created_at"]
        extra_kwargs = {"title": {"required": False}}

    def _split_existing_title(self):
        raw_title = str(self.instance.title or "") if self.instance else ""
        exc_type = "HOLIDAY"
        clean_reason = raw_title
        for prefix in ("SUSPENSION", "HOLIDAY", "EVENT"):
            tag = f"[{prefix}] "
            if raw_title.upper().startswith(tag):
                exc_type = prefix
                clean_reason = raw_title[len(tag):]
                break
        return exc_type, clean_reason

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        has_title_or_reason = ("title" in mutable and mutable.get("title") is not None) or (
            "reason" in mutable and mutable.get("reason") is not None
        )
        has_type = "type" in mutable and str(mutable.get("type") or "").strip() != ""

        if not mutable.get("title") and mutable.get("reason"):
            mutable["title"] = mutable["reason"]

        existing_type, existing_reason = self._split_existing_title()
        exc_type = str(mutable.get("type") or (existing_type if self.instance else "")).strip().upper()
        raw_title = str(mutable.get("title") or (existing_reason if (self.instance and has_type and not has_title_or_reason) else "")).strip()

        if has_title_or_reason or has_type:
            if exc_type in ("SUSPENSION", "HOLIDAY", "EVENT") and raw_title and not raw_title.startswith("["):
                mutable["title"] = f"[{exc_type}] {raw_title}"[:150]
            elif raw_title:
                mutable["title"] = raw_title[:150]

        mutable.pop("reason", None)
        return super().to_internal_value(mutable)

    def validate(self, attrs):
        if self.partial and "title" not in attrs:
            attrs.pop("type", None)
            return attrs
        if not str(attrs.get("title") or "").strip():
            raise serializers.ValidationError({"title": "A holiday or calendar title/reason is required."})
        attrs.pop("type", None)
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        raw_title = str(instance.title or "")
        exc_type = "HOLIDAY"
        clean_reason = raw_title
        for prefix in ("SUSPENSION", "HOLIDAY", "EVENT"):
            tag = f"[{prefix}] "
            if raw_title.upper().startswith(tag):
                exc_type = prefix
                clean_reason = raw_title[len(tag):]
                break
        data["type"] = exc_type
        data["reason"] = clean_reason
        data["affects_all_grades"] = True
        return data


class SchoolSettingsSerializer(serializers.ModelSerializer):
    school_logo = SchoolLogoField(required=False, allow_null=True)
    left_logo = SchoolLogoField(required=False, allow_null=True)
    right_logo = SchoolLogoField(required=False, allow_null=True)

    principal_faculty = serializers.PrimaryKeyRelatedField(
        source="principal_teacher",
        read_only=True,
    )
    principal_photo_url = serializers.SerializerMethodField()
    principal_employee_id = serializers.SerializerMethodField()
    principal_department = serializers.SerializerMethodField()
    principal_email = serializers.SerializerMethodField()
    principal_contact_number = serializers.SerializerMethodField()

    class Meta:
        model = SchoolSettings
        fields = [
            "id",
            "school_id",
            "school_name",
            "region",
            "division",
            "district",
            "academic_year",
            "address",
            "contact_number",
            "email",
            "website",
            "principal_teacher",
            "principal_faculty",
            "principal_name",
            "principal_title",
            "superintendent_name",
            "principal_photo_url",
            "principal_employee_id",
            "principal_department",
            "principal_email",
            "principal_contact_number",
            "school_logo",
            "left_logo",
            "right_logo",
            "latitude",
            "longitude",
            "geofence_radius_meters",
            "updated_at",
        ]
        extra_kwargs = {
            "school_id": {"required": False, "allow_blank": True},
            "school_name": {"required": False, "allow_blank": True},
            "principal_teacher": {"required": False, "allow_null": True},
        }

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)

        alias_map = {
            "school_address": "address",
            "school_contact": "contact_number",
            "school_email": "email",
            "school_head": "principal_name",
            "radius_meters": "geofence_radius_meters",
            "geofence_radius": "geofence_radius_meters",
            "emblem": "school_logo",
            "main_logo": "school_logo",
            "principal_faculty": "principal_teacher",
        }
        for src_key, dest_key in alias_map.items():
            if src_key in mutable and dest_key not in mutable:
                mutable[dest_key] = mutable[src_key]
        mutable.pop("principal_faculty", None)

        if "principal_teacher" in mutable and str(mutable["principal_teacher"]).strip().lower() in (
            "",
            "null",
            "none",
            "undefined",
        ):
            mutable["principal_teacher"] = None

        if "website" in mutable:
            raw_web = str(mutable.get("website") or "").strip()
            if raw_web and not raw_web.startswith(("http://", "https://")):
                mutable["website"] = f"https://{raw_web}"
            else:
                mutable["website"] = raw_web

        for coord_key in ("latitude", "longitude"):
            if coord_key in mutable:
                raw_coord = mutable[coord_key]
                if raw_coord in (None, "", "null", "undefined"):
                    mutable.pop(coord_key, None)
                else:
                    try:
                        parsed = float(raw_coord)
                        if not math.isfinite(parsed):
                            raise ValueError("non-finite")
                        mutable[coord_key] = Decimal(f"{parsed:.7f}")
                    except (TypeError, ValueError, InvalidOperation):
                        raise serializers.ValidationError({coord_key: f"Invalid {coord_key} value."})

        if "geofence_radius_meters" in mutable:
            raw_rad = mutable["geofence_radius_meters"]
            if raw_rad in (None, "", "null", "undefined"):
                mutable.pop("geofence_radius_meters", None)
            else:
                try:
                    parsed_rad = float(raw_rad)
                    if not math.isfinite(parsed_rad):
                        raise ValueError("non-finite")
                    mutable["geofence_radius_meters"] = max(20, min(5000, int(parsed_rad)))
                except (TypeError, ValueError, OverflowError):
                    raise serializers.ValidationError({"geofence_radius_meters": "Invalid radius in meters."})

        return super().to_internal_value(mutable)

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        if instance.principal_teacher:
            if not instance.principal_name:
                instance.principal_name = instance.principal_teacher.full_name
            if not instance.principal_title and instance.principal_teacher.position:
                instance.principal_title = instance.principal_teacher.position
            instance.save(update_fields=["principal_name", "principal_title", "updated_at"])
        return instance

    def get_principal_photo_url(self, obj):
        if obj.principal_teacher and obj.principal_teacher.photo:
            return build_media_url(obj.principal_teacher.photo, self.context.get("request"))
        return None

    def get_principal_employee_id(self, obj) -> str:
        return obj.principal_teacher.employee_id if obj.principal_teacher else ""

    def get_principal_department(self, obj) -> str:
        return obj.principal_teacher.department if obj.principal_teacher else "Administration"

    def get_principal_email(self, obj) -> str:
        return obj.principal_teacher.email if obj.principal_teacher else ""

    def get_principal_contact_number(self, obj) -> str:
        return obj.principal_teacher.contact_number if obj.principal_teacher else ""


class SectionSerializer(serializers.ModelSerializer):
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)
    grade_level_code = serializers.CharField(source="grade_level.code", read_only=True)
    adviser_id = serializers.IntegerField(source="adviser.id", read_only=True, allow_null=True)
    adviser_name = serializers.CharField(source="adviser.full_name", read_only=True)
    adviser_employee_id = serializers.CharField(source="adviser.employee_id", read_only=True, default="")
    adviser_photo_url = serializers.SerializerMethodField()
    school_year_code = serializers.CharField(source="school_year.code", read_only=True)
    display_label = serializers.SerializerMethodField()
    student_count = serializers.IntegerField(source="enrolled_count", read_only=True, default=0)

    class Meta:
        model = Section
        fields = [
            "id",
            "name",
            "code",
            "grade_level",
            "grade_level_name",
            "grade_level_code",
            "school_year",
            "school_year_code",
            "adviser",
            "adviser_id",
            "adviser_name",
            "adviser_employee_id",
            "adviser_photo_url",
            "room",
            "room_number",
            "capacity",
            "track_strand",
            "display_label",
            "student_count",
            "is_active",
        ]
        extra_kwargs = {"school_year": {"required": False}}
        validators = []

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        if "adviser" not in mutable and "adviser_id" in mutable:
            mutable["adviser"] = mutable.get("adviser_id")
        return super().to_internal_value(mutable)

    def get_adviser_photo_url(self, obj):
        if obj.adviser and obj.adviser.photo:
            return build_media_url(obj.adviser.photo, self.context.get("request"))
        return None

    def get_display_label(self, obj) -> str:
        return format_section_label(obj.grade_level.name if obj.grade_level else "", obj.name)

    def validate(self, attrs):
        sy = attrs.get("school_year") or (self.instance.school_year if self.instance else None)
        if not sy:
            sy = SchoolYear.objects.filter(is_active=True).first() or SchoolYear.objects.first()
            if not sy:
                raise serializers.ValidationError(
                    {"school_year": "Create an active School Year before adding sections."}
                )
            attrs["school_year"] = sy
        grade_level = attrs.get("grade_level") or (self.instance.grade_level if self.instance else None)
        name = attrs.get("name") if "name" in attrs else (self.instance.name if self.instance else None)
        if sy and grade_level and name:
            dup_qs = Section.objects.filter(school_year=sy, grade_level=grade_level, name=name)
            if self.instance:
                dup_qs = dup_qs.exclude(pk=self.instance.pk)
            if dup_qs.exists():
                raise serializers.ValidationError(
                    {"name": "A section with this name already exists for this grade level and school year."}
                )
        return attrs

    def create(self, validated_data):
        section = super().create(validated_data)
        sync_uniform_subjects_for_section(section)
        return section


class ClassPeriodSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source="section.name", read_only=True)
    grade_level_name = serializers.CharField(source="section.grade_level.name", read_only=True, default="")
    subject_code = serializers.CharField(source="subject.code", read_only=True)
    subject_title = serializers.CharField(source="subject.title", read_only=True)
    room_name = serializers.CharField(source="room.name", read_only=True, default="")
    teacher_id = serializers.IntegerField(read_only=True)
    teacher_name = serializers.SerializerMethodField()
    teacher_employee_id = serializers.SerializerMethodField()
    teacher_photo_url = serializers.SerializerMethodField()
    faculty_id = serializers.IntegerField(source="teacher_id", read_only=True)
    faculty_name = serializers.SerializerMethodField()
    faculty_employee_id = serializers.SerializerMethodField()
    faculty_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = ClassPeriod
        fields = [
            "id",
            "schedule_code",
            "section",
            "section_name",
            "grade_level_name",
            "subject",
            "subject_code",
            "subject_title",
            "teacher",
            "teacher_id",
            "teacher_name",
            "teacher_employee_id",
            "teacher_photo_url",
            "faculty_id",
            "faculty_name",
            "faculty_employee_id",
            "faculty_photo_url",
            "room",
            "room_name",
            "room_number",
            "days_of_week",
            "start_time",
            "end_time",
            "is_active",
        ]

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        # Accept teacher, teacher_id, faculty, or faculty_id interchangeably
        if "teacher" not in mutable:
            for alias in ("teacher_id", "faculty", "faculty_id"):
                if alias in mutable:
                    mutable["teacher"] = mutable[alias]
                    break
        if "section" not in mutable and "section_id" in mutable:
            mutable["section"] = mutable["section_id"]
        if "subject" not in mutable and "subject_id" in mutable:
            mutable["subject"] = mutable["subject_id"]
        if "room" not in mutable and "room_id" in mutable:
            mutable["room"] = mutable["room_id"]
        return super().to_internal_value(mutable)

    def get_teacher_name(self, obj) -> str:
        return obj.teacher.full_name if obj.teacher else "Unassigned"

    def get_faculty_name(self, obj) -> str:
        return obj.teacher.full_name if obj.teacher else "Unassigned"

    def get_faculty_employee_id(self, obj) -> str:
        return obj.teacher.employee_id if obj.teacher else ""

    def get_faculty_photo_url(self, obj):
        if obj.teacher and obj.teacher.photo:
            return build_media_url(obj.teacher.photo, self.context.get("request"))
        return None

    def get_teacher_employee_id(self, obj) -> str:
        return obj.teacher.employee_id if obj.teacher else ""

    def get_teacher_photo_url(self, obj):
        if obj.teacher and obj.teacher.photo:
            return build_media_url(obj.teacher.photo, self.context.get("request"))
        return None

    def create(self, validated_data):
        period = super().create(validated_data)
        sync_period_days(period, validated_data.get("days_of_week", "MON-FRI"))
        return period

    def update(self, instance, validated_data):
        period = super().update(instance, validated_data)
        if "days_of_week" in validated_data:
            sync_period_days(period, validated_data["days_of_week"])
        return period